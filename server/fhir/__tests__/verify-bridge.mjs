import { toFhirPatient, toFhirEncounter, toFhirObservation, toFhirCondition,
  toFhirServiceRequest, toFhirClaim, toFhirComposition, buildIps,
  buildTransactionBundle, IOMT_VITALS_LOINC, SYS } from "./fhir/mappers.js";
import { news2Score, isCriticalObservation, criticalVitals } from "./fhir/scoring.js";
import { validateClaim, resolveRCode } from "./fhir/nhia.js";
import { pushBundleToShr, matchPatientMpi } from "./fhir/integrations.js";
import { parseAdt, parseOru } from "./hl7/handlers.js";
import { HL7Message } from "hl7v2";

let pass=0, fail=0;
const A=(name,cond,detail="")=>{ (cond?pass++:fail++); console.log(`${cond?"PASS":"FAIL"}  ${name}${detail?"  ::  "+detail:""}`); };
const H=(t)=>console.log(`\n=== ${t} ===`);

// ---------- AREA 1: GHIMS Patient -> FHIR Patient (Ghana Card + NHIS) + MPI ----------
H("1) GHIMS Patient Record -> FHIR R4 Patient (Ghana Card + NHIS, MPI match)");
const patient = { id:"PT-00441", mrn:"PT-00441", ghanaCard:"GHA-190234-7", nhis:"NHIS-2291874",
  firstName:"Akosua", lastName:"Mensah", sex:"F", dob:new Date("1991-03-12"), region:"Greater Accra", district:"Accra Metro", facilityId:"KBTH", active:true };
const fp = toFhirPatient(patient);
A("Patient resourceType", fp.resourceType==="Patient");
A("Ghana Card identifier present", fp.identifier.some(i=>i.system===SYS.ghanaCard && i.value==="GHA-190234-7"));
A("NHIS identifier present", fp.identifier.some(i=>i.system===SYS.nhis && i.value==="NHIS-2291874"));
A("Name mapped", fp.name[0].family==="Mensah" && fp.name[0].given[0]==="Akosua");
// MPI: mock fetch, verify $match query uses Ghana Card identifier
globalThis.fetch = async (url)=>({ ok:true, status:200, text:async()=>JSON.stringify({ resourceType:"Bundle", entry:[{resource:{resourceType:"Patient",id:"MPI-1"}}] }) });
const mpi = await matchPatientMpi({ ghanaCard: patient.ghanaCard }, { baseUrl:"https://mpi.test/fhir" });
A("SanteMPI cross-facility match resolves", mpi.matched===true && mpi.total===1);

// ---------- AREA 2: GHIMS Encounter -> Encounter + SOAP + ICD-11 Condition + Bundle->SHR ----------
H("2) GHIMS Clinical Encounter -> Encounter + SOAP(Composition) + ICD-11 Condition + Bundle push");
const enc = { id:"ENC-1", patientId:patient.id, facilityId:"KBTH", class:"AMB", status:"finished", startedAt:new Date() };
const fe = toFhirEncounter(enc);
A("Encounter resourceType/class", fe.resourceType==="Encounter" && fe.class.code==="AMB");
const cond = { id:"CND-1", patientId:patient.id, encounterId:"ENC-1", code:"1F40", display:"Uncomplicated P. falciparum malaria", clinicalStatus:"active", recordedAt:new Date() };
const fc = toFhirCondition(cond);
A("ICD-11 Condition coded", fc.resourceType==="Condition" && fc.code.coding[0].system===SYS.icd11 && fc.code.coding[0].code==="1F40");
const comp = toFhirComposition({ id:"DOC-1", patientId:patient.id, encounterId:"ENC-1", soap:{ s:"Fever 3 days", o:"Temp 38.9, RDT+", a:"Malaria (1F40)", p:"Artemether-Lumefantrine BD x3d" }});
A("SOAP note -> Composition with 4 sections", comp.resourceType==="Composition" && comp.section.length===4 && comp.section[2].title==="Assessment");
const txn = buildTransactionBundle([fe, fc, comp]);
A("Transaction Bundle built for SHR", txn.type==="transaction" && txn.entry.length===3 && txn.entry[0].request.method);
let pushed=null; globalThis.fetch = async (url,opts)=>{ pushed={url,opts}; return { ok:true, status:200, text:async()=>JSON.stringify({resourceType:"Bundle",type:"transaction-response"}) }; };
const shr = await pushBundleToShr(txn, { baseUrl:"https://shr.test/fhir" });
A("Bundle pushed to SHR (HAPI FHIR)", shr.ok===true && JSON.parse(pushed.opts.body).type==="transaction");

// ---------- AREA 3: GHIMS Billing/NHIA Claim <-> Claim + auto-coding/validation ----------
H("3) GHIMS Billing / NHIA Claim <-> FHIR Claim + tariff/deadline/R-code");
const claimData = { id:"CLM-1", patientId:patient.id, facilityId:"KBTH",
  diagnoses:[{code:"1F40",display:"Malaria"}],
  items:[{ description:"OPD consultation", tariffCode:"OPD-CONSULT", amount:20 }, { description:"GeneXpert", tariffCode:"GENEXPERT", amount:55 }] };
const fclaim = toFhirClaim({ ...claimData, createdAt:new Date() });
A("Claim resource + total GHS", fclaim.resourceType==="Claim" && fclaim.total.value===75 && fclaim.total.currency==="GHS");
A("Claim diagnosis ICD-11", fclaim.diagnosis[0].diagnosisCodeableConcept.coding[0].code==="1F40");
const okClaim = validateClaim({ serviceDate:new Date(Date.now()-2*864e5), nhisVerified:true, credentialled:true, isDuplicate:false, items:claimData.items });
A("Valid claim passes tariff+deadline", okClaim.valid===true && okClaim.daysToDeadline===28);
const badClaim = validateClaim({ serviceDate:new Date(Date.now()-40*864e5), nhisVerified:false, credentialled:true, isDuplicate:true, items:[{tariffCode:"OPD-CONSULT",amount:99}] });
A("Bad claim flags deadline+R001+R024+tariff", !badClaim.valid && badClaim.errors.some(e=>e.code==="R001") && badClaim.errors.some(e=>e.code==="R024") && badClaim.errors.some(e=>e.code==="DEADLINE") && badClaim.errors.some(e=>e.code==="TARIFF-RANGE"));
A("R062 resolution escalates (auto=false)", resolveRCode("R062").auto===false);

// ---------- AREA 4: GHIMS Lab Result -> Observation (LOINC) + critical escalation ----------
H("4) GHIMS Lab Result -> FHIR Observation (LOINC) + critical escalation");
const labObs = { id:"OBS-L1", patientId:patient.id, code:"90271-0", display:"MTB/RIF", value:"DETECTED", interpretation:"A", status:"final", effectiveAt:new Date(), source:"hl7" };
const flab = toFhirObservation(labObs);
A("Lab Observation LOINC coded", flab.code.coding[0].system===SYS.loinc && flab.code.coding[0].code==="90271-0");
A("Critical result (MTB detected) -> escalate", isCriticalObservation(labObs)===true);
A("Normal Hb not critical", isCriticalObservation({code:"718-7", value:"12"})===false);
A("Low Hb (<7) critical", isCriticalObservation({code:"718-7", value:"6.4"})===true);
// HL7 ORU pipeline still parses to the same shape
const oru = HL7Message.parse(["MSH|^~\\&|GENEXPERT|TAMALE|CARDIOAI|GHS|20260808120000||ORU^R01|O1|P|2.5.1","PID|1||PT-00441^^^CARDIOAI^MR||MENSAH^AKOSUA","OBX|1|ST|90271-0^MTB detected^LN||DETECTED|||A|||F"].join("\r"));
const parsed = parseOru(oru);
A("HL7 ORU -> Observation extraction", parsed.mrn==="PT-00441" && parsed.observations[0].code==="90271-0" && parsed.observations[0].interpretation==="A");

// ---------- AREA 5: GHIMS Referral -> ServiceRequest + IPS summary ----------
H("5) GHIMS Referral Record -> FHIR ServiceRequest + cross-facility IPS");
const sr = toFhirServiceRequest({ id:"REF-1", patientId:patient.id, encounterId:"ENC-1", urgent:true, reasonCode:"1F40.1", reasonDisplay:"Severe malaria", requesterFacilityId:"CHPS-001", performerFacilityId:"KBTH", note:"Refer for IV artesunate" });
A("ServiceRequest urgent + ICD reason", sr.resourceType==="ServiceRequest" && sr.priority==="urgent" && sr.code.coding[0].code==="1F40.1");
A("Referral requester/performer set", sr.requester.reference==="Organization/CHPS-001" && sr.performer[0].reference==="Organization/KBTH");
const ips = buildIps({ patient, conditions:[cond], observations:[labObs], medications:[] });
A("IPS document Bundle built", ips.type==="document" && ips.entry[0].resource.resourceType==="Composition" && ips.entry[0].resource.section.length===3);
A("IPS includes Patient+Condition+Observation", ips.entry.some(e=>e.resource.resourceType==="Patient") && ips.entry.some(e=>e.resource.resourceType==="Condition") && ips.entry.some(e=>e.resource.resourceType==="Observation"));

// ---------- AREA 6: IoMT Vitals -> Observation (LOINC) + NEWS2 auto-score ----------
H("6) Cardio AI IoMT Vitals -> FHIR Observation (LOINC) + NEWS2 auto-scoring");
A("IoMT LOINC map: HR 8867-4", IOMT_VITALS_LOINC.heartRate.code==="8867-4");
A("IoMT LOINC map: SpO2 59408-5", IOMT_VITALS_LOINC.spo2.code==="59408-5");
const hrObs = toFhirObservation({ id:"OBS-V1", patientId:patient.id, code:IOMT_VITALS_LOINC.heartRate.code, display:IOMT_VITALS_LOINC.heartRate.display, value:"102", unit:"/min", effectiveAt:new Date(), source:"device" });
A("IoMT HR Observation valueQuantity", hrObs.valueQuantity.value===102 && hrObs.valueQuantity.unit==="/min");
const news = news2Score({ rr:22, spo2:93, temp:38.9, sbp:96, hr:102, consciousness:"A", onOxygen:false });
A("NEWS2 computes score+risk", typeof news.score==="number" && ["low","medium","high"].includes(news.risk), `score=${news.score} risk=${news.risk}`);
const crit = news2Score({ rr:28, spo2:88, temp:39.6, sbp:85, hr:135, consciousness:"V", onOxygen:true });
A("NEWS2 high-risk deteriorating patient -> escalate", crit.risk==="high" && crit.escalate===true, `score=${crit.score}`);
A("Critical single vital flags (spo2/sbp/hr/temp)", criticalVitals({spo2:88, sbp:85, hr:135, temp:39.6}).length===4);

console.log(`\n──────────────────────────────\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
