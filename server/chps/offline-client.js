// ============================================================
// CHPS device-side offline buffer — REFERENCE client.
// Runs on the CHPS compound device (browser/PWA or embedded). Queues changes
// while offline (up to 48h over 2G), batches + retries on reconnect, and
// reconciles server ids / conflicts from the sync response.
//
// This is a reference implementation to embed in the CHPS client app; it is
// framework-agnostic (inject a `storage` + `now`). Not imported by the server.
// ============================================================

const BUFFER_MS = 48 * 60 * 60 * 1000;   // 48-hour retention window

export function createOfflineBuffer({ deviceId, endpoint, storage, fetchImpl = fetch, now = () => Date.now(), batchSize = 50 }) {
  const KEY = `chps:queue:${deviceId}`;
  const CURSOR = `chps:cursor:${deviceId}`;

  const load = () => { try { return JSON.parse(storage.getItem(KEY) || "[]"); } catch { return []; } };
  const save = (q) => storage.setItem(KEY, JSON.stringify(q));

  // Queue a local change (called by the app on every create/update/delete).
  function enqueue(change) {
    const q = load();
    q.push({ ...change, clientId: change.clientId || `${deviceId}:${now()}:${q.length}`, queuedAt: now() });
    save(prune(q));
    return q.length;
  }

  // Drop anything older than the 48h window (2G reality: some batches never make it).
  function prune(q) { const cutoff = now() - BUFFER_MS; return q.filter((c) => c.queuedAt >= cutoff); }

  function pending() { return prune(load()).length; }

  // Attempt a sync: push queued changes, pull server changes. Safe to call often.
  async function sync() {
    const q = prune(load());
    if (!q.length && !getCursor()) { /* still pull */ }
    const batch = q.slice(0, batchSize);
    let res;
    try {
      res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, since: getCursor(), changes: batch }),
      });
    } catch (e) {
      return { ok: false, offline: true, pending: q.length };   // still offline; keep queue
    }
    if (!res.ok) return { ok: false, status: res.status, pending: q.length };
    const data = await res.json();

    // Remove acknowledged changes; keep the rest for the next batch.
    const ackedClientIds = new Set((data.applied || []).map((a) => a.clientId));
    const remaining = load().filter((c) => !ackedClientIds.has(c.clientId));
    save(remaining);
    if (data.syncToken) setCursor(data.syncToken);

    return { ok: true, applied: data.applied?.length || 0, conflicts: data.conflicts || [], pulled: data.serverChanges, pending: remaining.length };
  }

  function getCursor() { return storage.getItem(CURSOR) || null; }
  function setCursor(v) { storage.setItem(CURSOR, v); }

  return { enqueue, sync, pending, getCursor };
}
