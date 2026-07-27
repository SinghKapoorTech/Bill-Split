/**
 * reconcile-balances.mjs — one-off ledger reconciliation backfill.
 *
 * Rebuilds `balances` and `event_balances` docs from the source-of-truth bills
 * using the APP'S REAL shared calc code (functions/lib/shared/*.js), fixes the
 * legacy Kaizen footprint, and removes bug-artifact (junk) docs.
 *
 * Scope: only touches balance docs involving one of the four affected users
 * (Aakaash, Aman, Anuja, Simran) plus self-pair / malformed junk docs.
 *
 * Usage:
 *   node scripts/reconcile-balances.mjs            # DRY RUN (no writes)
 *   node scripts/reconcile-balances.mjs --commit   # apply changes to PROD
 *
 * Auth: reuses the firebase-tools CLI OAuth token (owner → bypasses rules).
 */
import fs from 'fs';
import {
  computeBillPersonTotals,
} from '../functions/lib/shared/calculations.js';
import {
  calculateFriendFootprint,
  getFriendBalanceId,
  getEventBalanceId,
  toSingleBalance,
  BALANCE_THRESHOLD,
  personIdToFirebaseUid as uid,
} from '../functions/lib/shared/ledgerCalculations.js';

const COMMIT = process.argv.includes('--commit');
const PROJECT = 'divit-6d217';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

// ── auth ──
const cfg = JSON.parse(fs.readFileSync('C:/Users/aakaa/.config/configstore/firebase-tools.json', 'utf8'));
const tok = cfg.tokens || {};
let cached = null;
async function token() {
  if (tok.access_token && (tok.expires_at || 0) > Date.now() + 60000) return tok.access_token;
  if (cached) return cached;
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com', client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi', refresh_token: tok.refresh_token, grant_type: 'refresh_token' }) });
  const j = await r.json(); cached = j.access_token; return cached;
}

// ── Firestore REST value (de)serialization ──
function dv(v){if(v==null)return null;if('nullValue'in v)return null;if('stringValue'in v)return v.stringValue;if('integerValue'in v)return Number(v.integerValue);if('doubleValue'in v)return v.doubleValue;if('booleanValue'in v)return v.booleanValue;if('timestampValue'in v)return v.timestampValue;if('mapValue'in v)return df(v.mapValue.fields||{});if('arrayValue'in v)return(v.arrayValue.values||[]).map(dv);if('referenceValue'in v)return v.referenceValue;return v;}
function df(f){const o={};for(const k in f)o[k]=dv(f[k]);return o;}
function ev(v){ // encode JS -> Firestore value
  if(v===null||v===undefined)return{nullValue:null};
  if(typeof v==='string')return{stringValue:v};
  if(typeof v==='boolean')return{booleanValue:v};
  if(typeof v==='number')return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
  if(v instanceof Date)return{timestampValue:v.toISOString()};
  if(Array.isArray(v))return{arrayValue:{values:v.map(ev)}};
  if(typeof v==='object')return{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,ev(x)]))}};
  throw new Error('cannot encode '+typeof v);
}
async function listAll(c){const tk=await token();const out=[];let p='';do{const url=`${BASE}/${c}?pageSize=300${p?`&pageToken=${encodeURIComponent(p)}`:''}`;const r=await fetch(url,{headers:{Authorization:`Bearer ${tk}`}});const j=await r.json();if(j.error)throw new Error(JSON.stringify(j.error));for(const d of(j.documents||[]))out.push({id:d.name.split('/').pop(),fieldNames:Object.keys(d.fields||{}),data:df(d.fields||{})});p=j.nextPageToken||'';}while(p);return out;}
async function patchDoc(coll,id,fields){const tk=await token();const mask=Object.keys(fields).map(k=>`updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');const url=`${BASE}/${coll}/${id}?${mask}`;const r=await fetch(url,{method:'PATCH',headers:{Authorization:`Bearer ${tk}`,'Content-Type':'application/json'},body:JSON.stringify({fields:Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,ev(v)]))})});const j=await r.json();if(j.error)throw new Error('PATCH '+coll+'/'+id+': '+JSON.stringify(j.error));return j;}
async function deleteDoc(coll,id){const tk=await token();const r=await fetch(`${BASE}/${coll}/${id}`,{method:'DELETE',headers:{Authorization:`Bearer ${tk}`}});if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error('DELETE '+coll+'/'+id+': '+JSON.stringify(j.error||r.status));}}

// ── affected users (scope) ──
const A='RrGSa7ixSSRhUlieYzDQNnExAjx1', B='sV7ZAkoqKuXVe6OGgJCe1Ga9DhE3', ANUJA='acfpmOnKZThGQyPX2elo9lirRgD2', SIM='mDaKIUQjHJhDcO6ChiAJtfXV9MS2';
const IN4=new Set([A,B,ANUJA,SIM]);
const NM={[A]:'Aakaash',[B]:'Aman',[ANUJA]:'Anuja',[SIM]:'Simran'};
const nm=u=>NM[u]||u.slice(0,8);

// ── replicate ledgerProcessor eligibility helpers ──
function resolveEligibleFriends(anchorId, ownerId, participantIds, people, users){
  const linked=new Set();
  for(const id of (participantIds||[])) linked.add(id);
  for(const p of (people||[])){const u=uid(p.id); if(u&&!u.startsWith('guest-')&&!u.startsWith('person-')&&u!=='anonymous') linked.add(u);}
  if(linked.size===0){linked.add(anchorId);linked.add(ownerId);}
  for(const u of users){ if(u.data.isShadow===true && [ownerId,anchorId].includes(u.data.createdById)) linked.add(u.id); }
  return linked;
}
function resolveEventParticipants(anchorId, eventId, linked, events){
  const eligible=new Set(linked);
  const evDoc=events.find(e=>e.id===eventId);
  if(evDoc){ for(const mid of (evDoc.data.memberIds||[])) if(mid!==anchorId) eligible.add(mid); }
  return eligible;
}

// ── main ──
const [bills, users, events, curFriend, curEvent] = await Promise.all([
  listAll('bills'), listAll('users'), listAll('events'), listAll('balances'), listAll('event_balances'),
]);
const realBills = bills.filter(b=>['private','event'].includes(b.data.billType));

// rebuilt aggregates
const friend={}, event={};
function addFriend(pid,parts,signed,billId,amt){const e=(friend[pid]??={id:pid,participants:parts,balance:0,unsettledBillIds:new Set()});e.balance+=signed;if(Math.abs(amt)>BALANCE_THRESHOLD)e.unsettledBillIds.add(billId);}
function addEvent(pid,parts,eventId,signed,billId,amt){const e=(event[pid]??={id:pid,eventId,participants:parts,balance:0,unsettledBillIds:new Set()});e.balance+=signed;if(Math.abs(amt)>BALANCE_THRESHOLD)e.unsettledBillIds.add(billId);}

const billFp={}; // billId -> {anchorId, eventId, friend:{}, event:{}}
function strip(fp){return Object.fromEntries(Object.entries(fp).filter(([,v])=>Math.abs(v)>BALANCE_THRESHOLD).map(([k,v])=>[k,Math.round(v*100)/100]));}
for(const b of realBills){
  const d=b.data;
  const ownerId=uid(d.ownerId); const anchorId=uid(d.paidById||d.ownerId);
  const people=d.people||[];
  if(!d.billData?.items?.length || !ownerId || people.length===0) continue;
  const personTotals=computeBillPersonTotals(d.billData, people, d.itemAssignments||{}, Boolean(d.splitEvenly));
  const linked=resolveEligibleFriends(anchorId, ownerId, d.participantIds||[], people, users);
  const fp=calculateFriendFootprint({people, personTotals, settledPersonIds:d.settledPersonIds||[], linkedFriendUids:linked, ownerId, creditorId:anchorId});
  billFp[b.id]={anchorId, eventId:d.eventId||null, friend:strip(fp), event:{}};
  for(const [debtor,amt] of Object.entries(fp)){
    const pid=getFriendBalanceId(anchorId,debtor);
    addFriend(pid,[anchorId,debtor].sort(),toSingleBalance(anchorId,debtor,amt),b.id,amt);
  }
  if(d.eventId){
    const parts=resolveEventParticipants(anchorId,d.eventId,linked,events);
    const efp=calculateFriendFootprint({people, personTotals, settledPersonIds:d.settledPersonIds||[], linkedFriendUids:parts, ownerId, creditorId:anchorId});
    billFp[b.id].event=strip(efp);
    for(const [debtor,amt] of Object.entries(efp)){
      const pid=getEventBalanceId(d.eventId,anchorId,debtor);
      addEvent(pid,[anchorId,debtor].sort(),d.eventId,toSingleBalance(anchorId,debtor,amt),b.id,amt);
    }
  }
}

// ── Bill footprint normalization: rewrite stale/corrupt stored footprints so
//    future pipeline edits diff to zero (prevents junk-doc regeneration).
//    In scope: bills whose footprint touches one of the 4 affected users.
const eqMap=(a,b)=>{a=a||{};b=b||{};const ka=Object.keys(a),kb=Object.keys(b);if(ka.length!==kb.length)return false;return ka.every(k=>Math.abs((a[k]||0)-(Math.round((b[k]||0)*100)/100))<BALANCE_THRESHOLD);};
const billFixes=[];
for(const b of realBills){
  const fpx=billFp[b.id]; if(!fpx) continue;
  const d=b.data;
  const touches=[...Object.keys(fpx.friend),...Object.keys(fpx.event),uid(d.paidById||d.ownerId)].some(u=>IN4.has(u))
    || [...Object.keys(d.processedBalances||{}),...Object.keys(d.processedEventBalances||{})].some(u=>IN4.has(uid(u)));
  if(!touches) continue;
  const curF=Object.fromEntries(Object.entries(d.processedBalances||{}).map(([k,v])=>[uid(k),Math.round(v*100)/100]));
  const curFAnchor=b.fieldNames.includes('processedBalancesAnchorId')?uid(d.processedBalancesAnchorId):null;
  const needF=!eqMap(curF,fpx.friend)||curFAnchor!==fpx.anchorId;
  let needE=false, curE=null, curEAnchor=null;
  if(fpx.eventId){
    curE=Object.fromEntries(Object.entries(d.processedEventBalances||{}).map(([k,v])=>[uid(k),Math.round(v*100)/100]));
    curEAnchor=b.fieldNames.includes('processedEventBalancesAnchorId')?uid(d.processedEventBalancesAnchorId):null;
    const curEId=b.fieldNames.includes('processedEventId')?d.processedEventId:null;
    needE=!eqMap(curE,fpx.event)||curEAnchor!==fpx.anchorId||curEId!==fpx.eventId;
  }
  if(needF||needE) billFixes.push({id:b.id,name:d.billData?.restaurantName||d.title,needF,needE,fpx,curF,curFAnchor,curE,curEAnchor});
}

// scope predicate: doc touches one of the 4, or is a self/malformed junk doc
const KNOWN=new Set(users.map(u=>u.id));
function isSelf(parts){return parts&&parts.length===2&&parts[0]===parts[1];}
function isMalformed(parts){return (parts||[]).some(p=>typeof p==='string'&&(p.startsWith('user-')||!KNOWN.has(p)));}
function inScope(parts){return (parts||[]).some(p=>IN4.has(p))||isSelf(parts)||isMalformed(parts);}

function round(n){return Math.round(n*100)/100;}
const plan={patch:[],zero:[],del:[]};

function reconcile(coll, current, rebuilt, isEvent){
  const seen=new Set();
  // existing docs
  for(const doc of current){
    const parts=doc.data.participants||doc.id.split('_').slice(isEvent?1:0);
    if(!inScope(parts)) continue;
    seen.add(doc.id);
    const r=rebuilt[doc.id];
    const curBal=doc.data.balance||0; const curBills=doc.data.unsettledBillIds||[];
    if(r && (Math.abs(r.balance)>BALANCE_THRESHOLD || r.unsettledBillIds.size>0)){
      const nb=round(r.balance); const nbills=[...r.unsettledBillIds].sort();
      if(Math.abs(curBal-nb)>BALANCE_THRESHOLD || JSON.stringify([...curBills].sort())!==JSON.stringify(nbills))
        plan.patch.push({coll,id:doc.id,parts:r.participants,eventId:r.eventId,from:{balance:round(curBal),bills:curBills.length},to:{balance:nb,bills:nbills.length},bills:nbills});
    } else {
      // should be zero/absent
      if(isSelf(parts)||isMalformed(parts)) plan.del.push({coll,id:doc.id,parts,balance:round(curBal)});
      else if(Math.abs(curBal)>BALANCE_THRESHOLD||curBills.length>0) plan.zero.push({coll,id:doc.id,parts,from:{balance:round(curBal),bills:curBills.length}});
    }
  }
  // brand-new docs the rebuild requires but that don't exist yet
  for(const [id,r] of Object.entries(rebuilt)){
    if(seen.has(id)) continue;
    if(!inScope(r.participants)) continue;
    if(Math.abs(r.balance)>BALANCE_THRESHOLD||r.unsettledBillIds.size>0)
      plan.patch.push({coll,id,parts:r.participants,eventId:r.eventId,from:null,to:{balance:round(r.balance),bills:r.unsettledBillIds.size},bills:[...r.unsettledBillIds].sort(),isNew:true});
  }
}
reconcile('balances', curFriend, friend, false);
reconcile('event_balances', curEvent, event, true);

// Kaizen footprint fix
const kz=realBills.find(b=>b.id==='T4qE1abHCcAun4nPHJnR');
let kaizenFix=null;
if(kz){
  const d=kz.data; const anchorId=uid(d.paidById||d.ownerId);
  const linked=resolveEligibleFriends(anchorId, uid(d.ownerId), d.participantIds||[], d.people||[], users);
  const pt=computeBillPersonTotals(d.billData,d.people||[],d.itemAssignments||{},Boolean(d.splitEvenly));
  const fp=calculateFriendFootprint({people:d.people||[],personTotals:pt,settledPersonIds:d.settledPersonIds||[],linkedFriendUids:linked,ownerId:uid(d.ownerId),creditorId:anchorId});
  const stripped=Object.fromEntries(Object.entries(fp).filter(([,v])=>Math.abs(v)>BALANCE_THRESHOLD).map(([k,v])=>[k,round(v)]));
  kaizenFix={id:kz.id,anchorId,current:d.processedBalances||{},currentAnchor:kz.fieldNames.includes('processedBalancesAnchorId')?d.processedBalancesAnchorId:null,correct:stripped};
}

// ── report ──
const fmt=o=>o.map(([u,v])=>`${nm(u)}:${v}`).join(', ');
console.log(`\n${'='.repeat(70)}\n  LEDGER RECONCILIATION  —  ${COMMIT?'*** COMMIT (writing to PROD) ***':'DRY RUN (no writes)'}\n${'='.repeat(70)}`);
console.log(`\nbills=${realBills.length}  users=${users.length}  events=${events.length}`);

console.log(`\n── PATCH (${plan.patch.length}) ──`);
for(const p of plan.patch) console.log(`  ${p.coll}/${nm(p.parts[0])}↔${nm(p.parts[1])}${p.eventId?' [ev]':''}  ${p.isNew?'(new)':`${p.from.balance} (${p.from.bills} bills)`} → ${p.to.balance} (${p.to.bills} bills)`);
console.log(`\n── ZERO OUT (${plan.zero.length}) ──`);
for(const p of plan.zero) console.log(`  ${p.coll}/${nm(p.parts[0])}↔${nm(p.parts[1])}  ${p.from.balance} (${p.from.bills} bills) → 0`);
console.log(`\n── DELETE junk (${plan.del.length}) ──`);
for(const p of plan.del) console.log(`  ${p.coll}/${p.id}  [${(p.parts||[]).map(nm).join(', ')}]  balance ${p.balance}`);
console.log(`\n── KAIZEN bill footprint ──`);
if(kaizenFix){console.log(`  current: {${fmt(Object.entries(kaizenFix.current).map(([k,v])=>[uid(k),round(v)]))}} anchor=${kaizenFix.currentAnchor?nm(uid(kaizenFix.currentAnchor)):'NONE'}`);console.log(`  fix to:  {${fmt(Object.entries(kaizenFix.correct).map(([k,v])=>[uid(k),v]))}} anchor=${nm(kaizenFix.anchorId)}`);}

console.log(`\n── BILL FOOTPRINT normalization (${billFixes.length}) ──`);
for(const f of billFixes){
  if(f.needF) console.log(`  ${f.name} [friend]  {${fmt(Object.entries(f.curF).map(([k,v])=>[k,v]))}}@${f.curFAnchor?nm(f.curFAnchor):'NONE'} → {${fmt(Object.entries(f.fpx.friend).map(([k,v])=>[uid(k),v]))}}@${nm(f.fpx.anchorId)}`);
  if(f.needE) console.log(`  ${f.name} [event]   {${fmt(Object.entries(f.curE||{}).map(([k,v])=>[k,v]))}}@${f.curEAnchor?nm(f.curEAnchor):'NONE'} → {${fmt(Object.entries(f.fpx.event).map(([k,v])=>[uid(k),v]))}}@${nm(f.fpx.anchorId)}`);
}

console.log(`\n── RESULTING CORRECT BALANCES (the 4 affected people) ──`);
function showPair(u1,u2){
  const pid=getFriendBalanceId(u1,u2); const r=friend[pid];
  const bal=r?round(r.balance):0; if(Math.abs(bal)<BALANCE_THRESHOLD)return;
  const [p0,p1]=pid.split('_'); const owed=bal>0?p0:p1; const ower=bal>0?p1:p0;
  console.log(`  ${nm(ower)} owes ${nm(owed)}  $${Math.abs(bal).toFixed(2)}`);
}
const P=[A,B,ANUJA,SIM];
for(let i=0;i<P.length;i++)for(let j=i+1;j<P.length;j++)showPair(P[i],P[j]);

// ── writes ──
if(COMMIT){
  console.log(`\n${'='.repeat(70)}\n  WRITING...\n${'='.repeat(70)}`);
  const now=new Date();
  let n=0;
  for(const p of plan.patch){ const f={id:p.id,participants:p.parts,balance:p.to.balance,unsettledBillIds:p.bills,lastUpdatedAt:now}; if(p.eventId)f.eventId=p.eventId; await patchDoc(p.coll,p.id,f); console.log(`  patched ${p.coll}/${p.id}`); n++; }
  for(const p of plan.zero){ await patchDoc(p.coll,p.id,{balance:0,unsettledBillIds:[],lastUpdatedAt:now}); console.log(`  zeroed ${p.coll}/${p.id}`); n++; }
  for(const p of plan.del){ await deleteDoc(p.coll,p.id); console.log(`  deleted ${p.coll}/${p.id}`); n++; }
  for(const f of billFixes){
    const fields={};
    if(f.needF){fields.processedBalances=f.fpx.friend;fields.processedBalancesAnchorId=f.fpx.anchorId;}
    if(f.needE){fields.processedEventBalances=f.fpx.event;fields.processedEventBalancesAnchorId=f.fpx.anchorId;fields.processedEventId=f.fpx.eventId;}
    await patchDoc('bills',f.id,fields); console.log(`  normalized footprint: ${f.name}`); n++;
  }
  console.log(`\nDONE. ${n} writes.`);
} else {
  console.log(`\n(dry run — no writes. Re-run with --commit to apply.)`);
}
