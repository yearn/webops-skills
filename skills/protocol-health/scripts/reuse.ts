import {join,resolve,basename} from 'node:path';
import {readFile} from 'node:fs/promises';
import {Cache,readJSON,save,hash,json} from './io';
import {pin,rpc,hex,pad} from './treasury';
import {logRange,TRANSFER} from './rpc-evidence';
export const IMPORT_FILES=['snapshot-latest.json','positions.json','balances-raw.json','blocks.json','flows.json','proposals.json','escrows.json','governance.json','recovery.json','addresses.json'];
export async function importEvidence(output:string,directory:string,cache:Cache) {
  const records:any[]=[];
  for(const file of IMPORT_FILES) {
    const body=await readFile(join(resolve(directory),file),'utf8'),data=JSON.parse(body),digest=hash(body);
    const record=await cache.get('imported-evidence',{file,sha256:digest},async()=>({file,sha256:digest,importedAt:new Date().toISOString(),original:data}));
    records.push({file,id:record.id,sha256:digest,observedAt:data.asOf?.iso??data.generatedAt??null});
  }
  // Verification notes document prior decisions; they do not attest that current balances are unchanged.
  for(const file of ['verification-log.md','methodology-review.md']) {
    const body=await readFile(join(resolve(directory),file),'utf8'),digest=hash(body);
    const record=await cache.get('imported-review',{file,sha256:digest},async()=>({file,sha256:digest,body}));
    records.push({file,id:record.id,sha256:digest});
  }
  await save(join(output,'imports.json'),{cutoff:cache.cutoff,records});return records;
}
export async function imported(output:string,cache:Cache,file:string) {
  const manifest=await readJSON(join(output,'imports.json')),entry=manifest.records.find((r:any)=>r.file===file);
  if(!entry)throw Error(`Missing imported ${file}`);
  const record=await readJSON(join(cache.directory,entry.id+'.json'));
  if(hash(record.data)!==record.digest)throw Error('Imported evidence integrity failure');
  return {data:record.data.original,evidence:entry.id};
}
export async function scanAccount(chain:number,owner:string,from:number,to:number,cache:Cache,action='tokentx'):Promise<any[]> {
  if(!process.env.ETHERSCAN_API_KEY&&!cache.offline)throw Error('Missing ETHERSCAN_API_KEY; relaunch through openv with it selected');
  const rows:any[]=[];
  for(let page=1;page<=100;page++) {
    const params={chain,owner:owner.toLowerCase(),from,to,action,page,offset:1000};
    const record=await cache.get('account-history',params,async()=>{
      const query=new URLSearchParams({chainid:String(chain),module:'account',action,address:owner,startblock:String(from),endblock:String(to),sort:'asc',page:String(page),offset:'1000',apikey:process.env.ETHERSCAN_API_KEY!});
      const result=await json('https://api.etherscan.io/v2/api?'+query);
      if(result.status==='0'&&(/No transactions found/i.test(result.message)||Array.isArray(result.result)&&!result.result.length))return [];
      if(result.status!=='1'||!Array.isArray(result.result))throw Error(`Account history unavailable for chain ${chain}; provider rejected ${action}`);
      return result.result;
    });
    rows.push(...record.data);if(record.data.length<1000)return rows;
  }
  if(from>=to)throw Error('Single-block account history exceeds pagination coverage');
  const mid=Math.floor((from+to)/2);
  return [...await scanAccount(chain,owner,from,mid,cache,action),...await scanAccount(chain,owner,mid+1,to,cache,action)];
}
export async function collectDelta(output:string,cache:Cache) {
  const prior=await imported(output,cache,'blocks.json'),scope=await imported(output,cache,'addresses.json');
  const result:any={cutoff:cache.cutoff,chains:{},errors:[]};
  for(const [cid,accounts] of Object.entries(scope.data.addresses)) {
    const chain=+cid,old=prior.data[cid];if(!old)continue;
    const block=await pin(chain,cache.cutoff,cache),owners=(accounts as any[]).filter(a=>['headline','inflight','contingent'].includes(a.tier)).map(a=>a.address.toLowerCase());
    let logs:any[]=[],provider='hypersync';
    try {
      for(let from=old.block+1;from<=block.number;) {
        const body={from_block:from,to_block:block.number+1,logs:[{topics:[[TRANSFER],owners.map(a=>'0x'+pad(a))]},{topics:[[TRANSFER],[],owners.map(a=>'0x'+pad(a))]}],field_selection:{log:['block_number','transaction_hash','log_index','address','topic1','topic2','topic3','data'],block:['number','timestamp']}};
        const record=await cache.get('delta-hypersync',{chain,body},()=>json(`https://${chain}.hypersync.xyz/query`,{method:'POST',headers:{'content-type':'application/json',Authorization:`Bearer ${process.env.ENVIO_HYPERSYNC_API_KEY}`},body:JSON.stringify(body)}));
        const timestamps=new Map<number,number>();for(const chunk of record.data.data??[])for(const b of chunk.blocks??[])timestamps.set(b.number,Number(BigInt(b.timestamp)));
        for(const chunk of record.data.data??[])for(const l of chunk.logs??[])if(!l.topic3&&l.data&&l.data!=='0x')logs.push({chain,token:l.address.toLowerCase(),from:'0x'+l.topic1.slice(-40).toLowerCase(),to:'0x'+l.topic2.slice(-40).toLowerCase(),value:BigInt(l.data).toString(),blockNumber:l.block_number,hash:l.transaction_hash,logIndex:l.log_index,timeStamp:timestamps.get(l.block_number),evidence:record.id});
        const next=record.data.next_block;if(!(next>from))throw Error('HyperSync failed to advance');if(next<=block.number&&record.data.archive_height<block.number)throw Error('HyperSync archive has not reached cutoff');from=next;
      }
    }catch {
      provider='rpc';logs=[];
      try {
        const raw=[...await logRange(chain,{topics:[TRANSFER,owners.map(a=>'0x'+pad(a))]},old.block+1,block.number,cache),...await logRange(chain,{topics:[TRANSFER,null,owners.map(a=>'0x'+pad(a))]},old.block+1,block.number,cache)];
        const timestamps=new Map<number,number>();
        for(const l of raw) {
          if(l.topics.length!==3)continue;const bn=Number(BigInt(l.blockNumber));
          if(!timestamps.has(bn)){const b=(await cache.get('block-reference',{chain,number:bn},()=>rpc(chain,'eth_getBlockByNumber',[hex(bn),false]))).data;timestamps.set(bn,Number(BigInt(b.timestamp)));}
          logs.push({chain,token:l.address.toLowerCase(),from:'0x'+l.topics[1].slice(-40).toLowerCase(),to:'0x'+l.topics[2].slice(-40).toLowerCase(),value:BigInt(l.data).toString(),blockNumber:bn,hash:l.transactionHash,logIndex:Number(BigInt(l.logIndex)),timeStamp:timestamps.get(bn)});
        }
      }catch(e:any){result.errors.push({chain,reason:e.message});}
    }
    const unique=[...new Map(logs.map(l=>[l.hash+':'+l.logIndex,l])).values()];
    result.chains[cid]={from:old,to:block,provider,owners,logs:unique};await save(join(output,'delta.json'),result);
    console.log(JSON.stringify({deltaChain:chain,provider,logs:unique.length,errors:result.errors.filter((e:any)=>e.chain===chain).length}));
  }
  return result;
}
