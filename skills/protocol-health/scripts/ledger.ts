import {join} from 'node:path';
import {Cache,readJSON,save} from './io';
import {imported} from './reuse';
import {pin,pad,uint} from './treasury';
import {multicall,logRange} from './rpc-evidence';
export async function ledger(output:string,cache:Cache) {
  const old=await imported(output,cache,'flows.json'),governance=await imported(output,cache,'governance.json'),prior=await imported(output,cache,'blocks.json');
  const block=await pin(1,cache.cutoff,cache),TA='0x1c221980aab2e52ccc02180e0c171ca5e5ffdfd6',genesis=old.data.budgetGenesis,seconds=old.data.periodSeconds,current=Math.floor((Date.parse(cache.cutoff)/1000-genesis)/seconds),calls=[];
  for(let p=0;p<=current;p++)for(const sel of ['0xf915293a','0xb21dc5e5','0x3bfbadde','0xabcc4f5a'])calls.push({target:TA,data:sel+pad(BigInt(p))});
  const reads=await multicall(1,calls,block.number,cache),periods=[];
  for(let p=0;p<=current;p++) {
    const part=reads.slice(p*4,p*4+4);if(part.some(r=>!r.success))throw Error('Protocol accounting view unavailable');
    periods.push({id:p,label:'P'+p+(p===current?' to cutoff':' completed'),start:new Date((genesis+p*seconds)*1000).toISOString(),end:new Date((genesis+(p+1)*seconds)*1000).toISOString(),complete:p<current,protocolRevenueUsd:Number(uint(part[0].data))/1e18,recordedCostsUsd:Number(uint(part[1].data))/1e18,profitsUsd:Number(uint(part[2].data))/1e18,lossesUsd:Number(uint(part[3].data))/1e18,evidence:part.map(r=>r.evidence)});
  }
  const addresses=[TA,'0x5b5ab518f532ce260a5d2795e1eec544fc159587','0xbcc932e4750c3e465a7e54a06a34f9edf8f6116b','0x5a74cb32d36f2f517db6f7b0a0591e09b22cde69'];
  const events=await logRange(1,{address:addresses},prior.data['1'].block+1,block.number,cache);
  const record=await cache.get('protocol-accounting-cutoff',{block:block.number,genesis,seconds},async()=>({block,periods,controlEvents:events,source:'TeamAccountant global_revenues/global_costs; reported USD allocated by on-chain 84-day period, not calendar month. Existing manual accounting and reporting delays remain limitations.'}));
  const fundingApprovals=events.filter((e:any)=>e.topics[0]==='0xae5b2886be95e8a25dc091dfc796aefa037b25c5dde2172364abec8d9e3e8cc9').map((e:any)=>({index:Number(BigInt(e.topics[1])),team:'0x'+e.topics[2].slice(-40),period:Number(BigInt(e.topics[3])),token:'0x'+e.data.slice(26,66),rawAmount:BigInt('0x'+e.data.slice(66,130)).toString(),durationSeconds:Number(BigInt('0x'+e.data.slice(130,194))),at:new Date(Number(BigInt(e.blockTimestamp))*1000).toISOString(),block:Number(BigInt(e.blockNumber)),tx:e.transactionHash}));
  const result={...record.data,fundingApprovals,evidence:record.id,priorEvidence:old.evidence};await save(join(output,'ledger-reconciled.json'),result);console.log(JSON.stringify({periods,controlEvents:events.length}));return result;
}
if(import.meta.main){const out=process.argv[2],run=await readJSON(join(out,'run.json'));await ledger(out,new Cache(join(out,'cache'),run.cutoff));}
