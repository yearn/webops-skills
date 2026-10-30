import {join} from 'node:path';
import {Cache,readJSON,save} from './io';
import {database} from './collect';
import {periods} from './periods';
export async function support(output:string,cache:Cache) {
  const refs:any[]=[];
  async function query(name:string,sql:string,args:any[]) {
    const r=await cache.get(name,{sql,args},async()=>{const db=await database();try{return await db.begin('READ ONLY',async tx=>{await tx`SET LOCAL statement_timeout = '45000'`;return Array.from(await tx.unsafe(sql,args));});}finally{await db.close({timeout:1})}});
    refs.push({name,id:r.id,rows:r.data.length});await save(join(output,'support-reference.json'),{cutoff:cache.cutoff,refs});console.log(JSON.stringify({support:name,rows:r.data.length}));return r;
  }
  await query('debt-opening-state',`SELECT DISTINCT ON (chain_id,address,args->>'strategy') chain_id,address,args,block_number,block_time,transaction_hash,log_index FROM evmlog WHERE event_name = 'DebtUpdated' AND block_time < $1 ORDER BY chain_id,address,args->>'strategy',block_time DESC,block_number DESC,log_index DESC`,[periods(cache.cutoff)[0].start]);
  for(const m of periods(cache.cutoff))await query('daily-share-price',`SELECT DISTINCT ON (chain_id,address,date_trunc('day',block_time AT TIME ZONE 'UTC')) chain_id,address,value,block_number,block_time FROM output WHERE label = 'pps' AND component = 'humanized' AND block_time >= $1 AND block_time < $2 ORDER BY chain_id,address,date_trunc('day',block_time AT TIME ZONE 'UTC'),block_time DESC`,[m.start,m.end]);
  const catalog=await cache.get('kong-research-catalog',{purpose:'classification and immutable target mapping; post-cutoff numeric state excluded'},async()=>{const db=await database();try{return Array.from(await db`SELECT chain_id,address,snapshot,hook,block_number,block_time FROM snapshot`);}finally{await db.close({timeout:1});}});
  await save(join(output,'catalog-reference.json'),{id:catalog.id,records:catalog.data.length});
  const debt=await cache.get('kong-debt-history',{start:periods(cache.cutoff)[0].start,end:cache.cutoff},async()=>{const db=await database();try{return Array.from(await db`SELECT chain_id,address,args,block_number,block_time,transaction_hash,log_index FROM evmlog WHERE event_name = 'DebtUpdated' AND block_time >= ${periods(cache.cutoff)[0].start} AND block_time < ${cache.cutoff} ORDER BY block_number,log_index`);}finally{await db.close({timeout:1});}});
  await save(join(output,'debt-history-reference.json'),{id:debt.id,records:debt.data.length});
  return refs;
}
if(import.meta.main){const out=process.argv[2],r=await readJSON(join(out,'run.json')),keep=setInterval(()=>{},1000);try{await support(out,new Cache(join(out,'cache'),r.cutoff));}finally{clearInterval(keep)}}
