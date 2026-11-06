import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {loadWallet,secretDir} from './wallet-store.mjs';
const base='https://guardlink.ajnasnb.com',report=JSON.parse(readFileSync('docs/ethglobal/demo-run.public.json','utf8'));
const actor=JSON.parse(readFileSync(join(secretDir,'actors.local.json'),'utf8')).find(a=>a.id==='member-a'),wallet=await loadWallet(actor);
let cookie;
async function post(path,body){const response=await fetch(`${base}/api/v1${path}/`,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error??'Receipt indexing failed.');if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return data;}
const challenge=await post('/auth/challenge',{wallet:actor.address});await post('/auth/verify',{id:challenge.id,signature:await wallet.signMessage(challenge.message)});
const creation=report.transactions.find(tx=>tx.label==='Propose prospective demo coverage');if(!creation)throw new Error('No proposal creation receipt is recorded.');
console.log(JSON.stringify({creationReceipt:creation.hash,result:await post('/governance/sync',{txHash:creation.hash}),chainTransactionsSent:0}));
if(report.governance?.executionTx)console.log(JSON.stringify({executionReceipt:report.governance.executionTx,result:await post('/governance/sync',{txHash:report.governance.executionTx}),chainTransactionsSent:0}));
