import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {Contract,Interface,JsonRpcProvider,parseUnits} from 'ethers';
const path='docs/ethglobal/contribution-route.base-sepolia.public.json',proof=JSON.parse(readFileSync(path,'utf8'));
const base=new JsonRpcProvider('https://sepolia.base.org'),arc=new JsonRpcProvider('https://rpc.drpc.testnet.arc.io');
assert.equal((await base.getNetwork()).chainId,84532n);assert.equal((await arc.getNetwork()).chainId,5042002n);
const baseUsdc='0x036CbD53842c5426634e7929541eC2318f3dCF7e',weth='0x4200000000000000000000000000000000000006',router='0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4',poolAddress='0x335d2ce0c397016ac0e1d6930eb98a1dfe47c895';
const transfer=new Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
function transfers(receipt,token){return receipt.logs.filter(log=>log.address.toLowerCase()===token.toLowerCase()).map(log=>{try{return transfer.parseLog(log);}catch{return null;}}).filter(Boolean);}
const [swap,burn,mint,deposit]=await Promise.all([base.getTransactionReceipt(proof.swap.txHash),base.getTransactionReceipt(proof.bridge.steps.find(s=>s.name==='burn').txHash),arc.getTransactionReceipt(proof.bridge.steps.find(s=>s.name==='mint').txHash),arc.getTransactionReceipt(proof.contribution.txHash)]);
assert.ok([swap,burn,mint,deposit].every(receipt=>receipt?.status===1));assert.equal(swap.to.toLowerCase(),router.toLowerCase());assert.equal(deposit.to.toLowerCase(),poolAddress.toLowerCase());
assert.ok(transfers(swap,weth).some(event=>event.args.from.toLowerCase()===proof.source.toLowerCase()&&event.args.to.toLowerCase()===proof.pool.toLowerCase()&&event.args.value===parseUnits(proof.swap.amountIn,18)));
assert.ok(transfers(swap,baseUsdc).some(event=>event.args.to.toLowerCase()===proof.source.toLowerCase()&&event.args.from.toLowerCase()===proof.pool.toLowerCase()&&event.args.value===parseUnits(proof.swap.received,6)));
assert.ok(transfers(burn,baseUsdc).some(event=>event.args.to==='0x0000000000000000000000000000000000000000'&&event.args.value===parseUnits(proof.bridge.amount,6)));
const arcUsdc=new Contract('0x3600000000000000000000000000000000000000',['function balanceOf(address) view returns(uint256)'],arc);
const [before,after]=await Promise.all([arcUsdc.balanceOf(proof.recipient,{blockTag:mint.blockNumber-1}),arcUsdc.balanceOf(proof.recipient,{blockTag:mint.blockNumber})]);
assert.equal(after-before,BigInt(proof.bridge.arcReceivedAtomic));assert.ok(after-before>=1000000n);
const pool=new Contract(poolAddress,['function ownerOf(uint256) view returns(address)','function policies(uint256) view returns(address,uint64,uint64,uint128,uint128)','event Contribution(address indexed member,uint256 indexed policyId,uint128 amount)'],arc);
const event=deposit.logs.filter(log=>log.address.toLowerCase()===poolAddress).map(log=>{try{return pool.interface.parseLog(log);}catch{return null;}}).find(log=>log?.name==='Contribution');
assert.equal(event.args.member.toLowerCase(),proof.recipient.toLowerCase());assert.equal(event.args.policyId,BigInt(proof.contribution.policyId));assert.equal(event.args.amount,1000000n);
assert.equal((await pool.ownerOf(event.args.policyId)).toLowerCase(),proof.recipient.toLowerCase());assert.equal((await pool.policies(event.args.policyId))[3],6000000n);
proof.verification={checkedAt:new Date().toISOString(),sourceSwapReceipt:true,canonicalUsdcBurnReceipt:true,destinationBalanceAtMintBlock:true,depositReceipt:true,policyOwnerConfirmed:true,policyLimitAtomic:'6000000',transactionsSent:0};
if (process.argv.includes('--write-proof')) {
  const output = JSON.stringify(proof, null, 2) + '\n';
  writeFileSync(path, output);
  mkdirSync('frontend/public/demo', { recursive: true });
  writeFileSync('frontend/public/demo/contribution-route.json', output);
}
console.log(JSON.stringify({passed:true,swap:proof.swap,bridge:proof.bridge,contribution:proof.contribution,verification:proof.verification}));
