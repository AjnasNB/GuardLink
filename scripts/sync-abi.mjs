import {readFileSync,writeFileSync} from 'node:fs';
const artifact=JSON.parse(readFileSync('onchain/contracts/out/GuardLinkPool.sol/GuardLinkPool.json','utf8'));
writeFileSync('packages/domain/src/abi.ts',`// Generated from the Arc Studio-reviewed GuardLinkPool artifact.\nexport const guardlinkAbi = ${JSON.stringify(artifact.abi,null,2)} as const;\n`);
console.log(`Exported ${artifact.abi.length} ABI entries.`);
