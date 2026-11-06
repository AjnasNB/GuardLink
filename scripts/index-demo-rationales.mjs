import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {loadWallet,secretDir} from './wallet-store.mjs';
const base='https://guardlink.ajnasnb.com',report=JSON.parse(readFileSync('docs/ethglobal/demo-run.public.json','utf8')),actors=JSON.parse(readFileSync(join(secretDir,'actors.local.json'),'utf8'));
for(const [caseLabel,actorId,appealRound,reason,label]of[
 ['A','juror-1',false,'Synthetic evidence matches demo coverage.','CaseA approve juror-1'],
 ['A','juror-2',false,'Synthetic evidence matches demo coverage.','CaseA approve juror-2'],
 ['B','juror-1',false,'Synthetic initial decision disputed by claimant.','CaseB reject juror-1'],
 ['B','juror-2',false,'Synthetic initial decision disputed by claimant.','CaseB reject juror-2'],
 ['B','appeal-1',true,'Independent review confirms synthetic coverage.','CaseB appeal approval appeal-1'],
 ['B','appeal-2',true,'Independent review confirms synthetic coverage.','CaseB appeal approval appeal-2']
]){
 const actor=actors.find(a=>a.id===actorId),wallet=await loadWallet(actor);let cookie;
 async function request(path,body,expected=200){const response=await fetch(`${base}/api/v1${path}/`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});const data=await response.json();assert.equal(response.status,expected,data.error);if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return data;}
 const challenge=await request('/auth/challenge',{wallet:actor.address});await request('/auth/verify',{id:challenge.id,signature:await wallet.signMessage(challenge.message)});
 const creation=report.transactions.find(tx=>tx.label===label);assert.ok(creation,`Missing vote receipt: ${label}`);
 const path=`/claims/${report.cases[caseLabel].id}`;
 await request(`${path}/sync`,{txHash:creation.hash,reason:'A false explanation must not overwrite the committed vote.',appealRound},400);
 await request(`${path}/sync`,{txHash:creation.hash,reason,appealRound});const cl=await request(path);const ballot=(appealRound?cl.appealVotes:cl.votes).find(v=>v.jurorId===actorId);assert.equal(ballot.reason,reason);assert.equal(cl.status,'paid');console.log(JSON.stringify({case:caseLabel,actor:actorId,appealRound,reasonCommitmentMatched:true,incorrectReasonRejected:true,chainTransactionsSent:0}));
}
