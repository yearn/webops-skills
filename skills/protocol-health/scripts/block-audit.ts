import {join} from 'node:path';
import {Cache,readJSON,save,json} from './io';
import {rpc,hex} from './treasury';
export async function auditBlocks(output:string,cache:Cache) {
  const prep=await readJSON(join(output,'vault-preparation.json')),meta=new Map(prep.metadata.map((m:any)=>[m.id,m])),byChain=new Map<number,Set<number>>();
  for(const part of prep.series)for(const point of (await readJSON(part.file)).points){const m:any=meta.get(point.id);if(!m||m.excluded||point.usd==null||m.chain===4663)continue;const set=byChain.get(m.chain)??new Set<number>();set.add(point.block);byChain.set(m.chain,set);}
  const jobs:any[]=[];for(const [chain,set] of byChain){const nums=[...set].sort((a,b)=>a-b);for(let i=0;i<nums.length;i+=50)jobs.push({chain,numbers:nums.slice(i,i+50)});}
  const references:any[]=[];let cursor=0,completed=0;
  async function worker(){while(cursor<jobs.length){const job=jobs[cursor++];const record=await cache.get('block-time-batch',job,async()=>{
    const body=job.numbers.map((n:number,id:number)=>({jsonrpc:'2.0',id,method:'eth_getBlockByNumber',params:[hex(n),false]}));
    try{const data=await json(process.env['RPC_URL_'+job.chain]!,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!Array.isArray(data)||data.some(x=>x.error||!x.result))throw Error('Batch unavailable');const sorted=data.sort((a,b)=>a.id-b.id);return sorted.map(x=>({number:Number(BigInt(x.result.number)),timestamp:new Date(Number(BigInt(x.result.timestamp))*1000).toISOString(),hash:x.result.hash}));}
    catch{const rows=[];for(const n of job.numbers){const b=await rpc(job.chain,'eth_getBlockByNumber',[hex(n),false]);rows.push({number:n,timestamp:new Date(Number(BigInt(b.timestamp))*1000).toISOString(),hash:b.hash});}return rows;}
  });references.push({chain:job.chain,id:record.id,blocks:record.data});completed++;if(completed%10===0)console.log(JSON.stringify({blockBatches:completed,total:jobs.length}));}}
  await Promise.all(Array.from({length:4},worker));await save(join(output,'block-audit.json'),{cutoff:cache.cutoff,references});return references;
}
if(import.meta.main){const out=process.argv[2],run=await readJSON(join(out,'run.json'));await auditBlocks(out,new Cache(join(out,'cache'),run.cutoff));}
