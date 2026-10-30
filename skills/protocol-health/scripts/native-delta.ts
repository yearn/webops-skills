import {join} from 'node:path';
import {Cache,readJSON,save} from './io';
import {scanAccount} from './reuse';
export async function nativeDelta(out:string,cache:Cache){
 const delta=await readJSON(join(out,'delta.json')),d=delta.chains['1'],rows=[],errors=[];
 const owners=['0xfeb4acf3df3cdea7399794d0869ef76a6efaff52','0x93a62da5a14c80f265dabc077fcee437b1a0efde','0xbcc932e4750c3e465a7e54a06a34f9edf8f6116b'];
 for(const owner of owners)for(const action of ['txlist','txlistinternal']){try{const result=await scanAccount(1,owner,d.from.block+1,d.to.number,cache,action);for(const r of result)if(BigInt(r.value||'0')>0n&&r.isError!=='1')rows.push({owner,action,...r});}catch(e:any){errors.push({owner,action,reason:e.message});}await new Promise(r=>setTimeout(r,1100));}
 await save(join(out,'native-delta.json'),{cutoff:cache.cutoff,rows,errors});console.log(JSON.stringify({rows:rows.length,errors}));
}
if(import.meta.main){const out=process.argv[2],r=await readJSON(join(out,'run.json'));await nativeDelta(out,new Cache(join(out,'cache'),r.cutoff));}
