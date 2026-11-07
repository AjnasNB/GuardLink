import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {Contract,JsonRpcProvider,formatUnits,parseUnits} from 'ethers';
import {loadWallet,secretDir} from './wallet-store.mjs';
const base=process.argv[2]??'https://guardlink.ajnasnb.com';
const deploymentRoot=process.env.GUARDLINK_DEMO_DEPLOYMENT_ROOT??'.';
const reportPath='docs/ethglobal/demo-run.public.json',report=JSON.parse(readFileSync(reportPath,'utf8'));
const actors=JSON.parse(readFileSync(join(secretDir,'actors.local.json'),'utf8'));
const provider=new JsonRpcProvider('https://rpc.drpc.testnet.arc.io');
assert.equal((await provider.getNetwork()).chainId,5042002n);
const abi=JSON.parse(readFileSync('onchain/contracts/out/GuardLinkPool.sol/GuardLinkPool.json','utf8')).abi;
const pool=new Contract(report.pool,abi,provider),token=new Contract('0x3600000000000000000000000000000000000000',['function balanceOf(address) view returns(uint256)'],provider);
const cookies=new Map(),checks=[];
async function request(id,path,body){return fetch(`${base}/api/v1${path}/`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(cookies.has(id)?{Cookie:cookies.get(id)}:{})},body:body?JSON.stringify(body):undefined});}
for(const id of ['member-a','member-b','contact','juror-1','appeal-1']){
 const actor=actors.find(a=>a.id===id),wallet=await loadWallet(actor);
 const response=await request(id,'/auth/challenge',{wallet:actor.address});assert.equal(response.status,200);const challenge=await response.json();
 assert.ok(challenge.message.includes('\nVersion: 1\nChain ID: 5042002\n'));
 assert.ok(!challenge.message.includes('localhost'));assert.ok(!challenge.message.includes('\\n'));
 const result=await request(id,'/auth/verify',{id:challenge.id,signature:await wallet.signMessage(challenge.message)});assert.equal(result.status,200);cookies.set(id,result.headers.get('set-cookie').split(';')[0]);
}
checks.push('Five distinct role signatures; structured public-origin challenge');
const a=report.cases.A,b=report.cases.B;
assert.equal((await request('member-b',`/claims/${a.id}`)).status,403);
assert.equal((await request('contact',`/claims/${a.id}`)).status,403);
assert.equal((await request('juror-1',`/claims/${a.id}`)).status,200);
assert.equal((await request('appeal-1',`/claims/${b.id}`)).status,200);
const own=await(await request('member-a',`/claims/${a.id}`)).json();
assert.equal((await request('member-b',`/evidence/${own.documents[0].id}`)).status,403);
const evidence=await request('juror-1',`/evidence/${own.documents[0].id}`);assert.equal(evidence.status,200);assert.ok((await evidence.text()).startsWith('%PDF-'));
checks.push('Cross-member and unassigned-helper evidence denied; assigned reviewer retrieval works');
assert.equal((await request('member-a','/organizer')).status,403);
const operator=await loadWallet(JSON.parse(readFileSync(join(deploymentRoot,'preparation/deployment-wallet.local.json'),'utf8')));
const operatorChallenge=await(await request('operator','/auth/challenge',{wallet:operator.address})).json();
const operatorLogin=await request('operator','/auth/verify',{id:operatorChallenge.id,signature:await operator.signMessage(operatorChallenge.message)});assert.equal(operatorLogin.status,200);cookies.set('operator',operatorLogin.headers.get('set-cookie').split(';')[0]);
const rosterResponse=await request('operator','/organizer');assert.equal(rosterResponse.status,200);const roster=await rosterResponse.json();assert.ok(roster.members.length>=9);assert.ok(roster.cases.every(c=>!('description'in c)&&!('documents'in c)));
checks.push('Ordinary member cannot open operator controls; designated operator gets roster and safe assignment queue');
for(const [label,cl] of Object.entries(report.cases)){
 const current=await(await request(cl.member,`/claims/${cl.id}`)).json();assert.equal(current.status,'paid');assert.equal(current.recommendation.source,'azure');assert.equal(current.requests.filter(r=>r.status==='open').length,0);
 const receipt=await provider.getTransactionReceipt(current.transactionHash);assert.equal(receipt.status,1);assert.equal(receipt.to.toLowerCase(),report.pool.toLowerCase());
 const paid=receipt.logs.filter(l=>l.address.toLowerCase()===report.pool.toLowerCase()).map(l=>{try{return pool.interface.parseLog(l);}catch{return null;}}).find(l=>l?.name==='ClaimPaid');
 assert.equal(paid.args.claimId,current.chainClaimId);assert.equal(paid.args.amount,parseUnits(cl.requestedAmount,6));
 const chain=await pool.getClaim(current.chainClaimId);assert.equal(chain.paid,true);assert.equal(chain.claimant.toLowerCase(),actors.find(a=>a.id===cl.member).address.toLowerCase());
 await assert.rejects(()=>pool.settle.staticCall(current.chainClaimId));
 cl.status='paid';cl.payoutTx=current.transactionHash;
 if(label==='B'){const first=await pool.getJury(current.chainClaimId,false),appeal=await pool.getJury(current.chainClaimId,true);assert.ok(first.every(x=>!appeal.map(y=>y.toLowerCase()).includes(x.toLowerCase())));assert.equal(chain.appealed,true);}
 checks.push(`Case ${label}: private API, actual AI recommendation, exact payout event, independent chain state, duplicate settlement rejected`);
}
const proposal=await pool.getProposal(BigInt(report.governance.id));assert.equal(proposal.executed,true);assert.equal(proposal.yesVotes,9n);assert.equal(proposal.noVotes,0n);assert.equal(await pool.coverageLimit(),6000000n);assert.equal((await pool.policies(1)).limit,5000000n);
const terms=await(await request('member-a','/terms')).json();assert.equal(terms.coverageLimit,'6');
const proposals=await(await request('member-a','/governance')).json();const executed=proposals.find(p=>String(p.id)===String(report.governance.id));assert.equal(executed?.status,'Executed');assert.equal(executed.yesVotes,'9');assert.equal(executed.canExecute,false);assert.ok(executed.description.includes('future coverage'));
checks.push('Executed nine-voter prospective governance; current API terms match chain and prior policy preserved');
const publicRecords=await(await request('anonymous','/claims/public')).json();assert.ok(publicRecords.every(c=>!('documents'in c)&&!('description'in c)&&!('memberId'in c)));
checks.push('Public case projections omit evidence and member identity');
report.poolBalance=formatUnits(await token.balanceOf(report.pool),6);report.lastVerifiedAt=new Date().toISOString();
const proof={checkedAt:report.lastVerifiedAt,base,chainId:5042002,pool:report.pool,checks,status:'passed',transactionsSent:0,poolBalance:report.poolBalance};
if(process.env.GUARDLINK_WRITE_EVIDENCE!=='false'){writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');writeFileSync('docs/ethglobal/live-verification.json',JSON.stringify(proof,null,2)+'\n');}
console.log(JSON.stringify(proof));
