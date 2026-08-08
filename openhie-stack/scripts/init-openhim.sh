#!/usr/bin/env bash
# Register Cardio AI channels in OpenHIM so it routes SHR/CR/FR/HMIS traffic.
# Usage: ./scripts/init-openhim.sh   (reads .env; -k because OpenHIM uses self-signed certs by default)
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a

API="${OPENHIM_API:-https://localhost:5001}"
USER="${OPENHIM_USER:-root@openhim.org}"
PASS="${OPENHIM_PASSWORD:-openhim-password}"

echo "Waiting for OpenHIM core at $API ..."
for i in $(seq 1 30); do
  curl -k -sf "$API/heartbeat" >/dev/null 2>&1 && break
  sleep 5
done

echo "Authenticating as $USER ..."
# OpenHIM uses a salt + sha512 passwordHash scheme for its API auth.
SALT=$(curl -k -s "$API/authenticate/$USER" | sed -n 's/.*"salt":"\([^"]*\)".*/\1/p')
if [ -z "$SALT" ]; then echo "Could not fetch auth salt — is the user correct and core up?"; exit 1; fi
TS=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
PASSHASH=$(printf '%s%s' "$SALT" "$PASS" | sha512sum | awk '{print $1}')
TOKEN=$(printf '%s%s' "$PASSHASH" "$TS" | sha512sum | awk '{print $1}')

hdr=(-H "auth-username: $USER" -H "auth-ts: $TS" -H "auth-salt: $SALT" -H "auth-token: $TOKEN")

echo "Creating a 'cardio-ai' client (mutual-TLS / basic identity)..."
curl -k -s "${hdr[@]}" -H "Content-Type: application/json" -X POST "$API/clients" -d '{
  "clientID":"cardio-ai","name":"Cardio AI Ghana","roles":["cardio-ai"],
  "passwordAlgorithm":"bcrypt"
}' >/dev/null || echo "  (client may already exist)"

echo "Importing channels..."
python3 - "$API" "$USER" "$SALT" "$TS" "$TOKEN" <<'PY'
import json,sys,ssl,urllib.request
API,USER,SALT,TS,TOKEN=sys.argv[1:6]
ctx=ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
chans=json.load(open("config/openhim-channels.json"))
for ch in chans:
    req=urllib.request.Request(API+"/channels",data=json.dumps(ch).encode(),method="POST",
        headers={"Content-Type":"application/json","auth-username":USER,"auth-ts":TS,"auth-salt":SALT,"auth-token":TOKEN})
    try:
        urllib.request.urlopen(req,context=ctx); print("  + channel:",ch["name"])
    except Exception as e:
        print("  ! channel:",ch["name"],"->",getattr(e,'reason',e))
PY
echo "Done. Open the console at http://localhost:9000 to verify."
