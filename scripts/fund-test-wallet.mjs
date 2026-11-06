import {readFileSync} from 'node:fs';
import {isAddress,JsonRpcProvider,parseEther} from 'ethers';
import {loadWallet} from './wallet-store.mjs';
const address=process.argv[2];
if(!address||!isAddress(address))throw new Error('Provide the public address of a separate MetaMask test account. Never provide a private key.');
const provider=new JsonRpcProvider('https://rpc.drpc.testnet.arc.io');
if((await provider.getNetwork()).chainId!==5042002n)throw new Error('This utility only operates on Arc Testnet.');
const wallet=(await loadWallet(JSON.parse(readFileSync('preparation/deployment-wallet.local.json','utf8')))).connect(provider);
const target=parseEther('2'),balance=await provider.getBalance(address);
if(balance>=target){console.log('This test wallet already has at least 2 test USDC. No transfer sent.');process.exit(0);}
if(await provider.getBalance(wallet.address)<target-balance+parseEther('0.1'))throw new Error('Deployment wallet needs more test funds. Use the official faucet within its limits.');
const tx=await wallet.sendTransaction({to:address,value:target-balance}),receipt=await tx.wait();
if(receipt.status!==1)throw new Error('Test funding failed.');
console.log(JSON.stringify({chainId:5042002,testnet:true,recipient:address,transactionHash:receipt.hash,receiptStatus:'success'}));
