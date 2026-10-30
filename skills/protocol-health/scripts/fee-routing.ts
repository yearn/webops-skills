import {join} from 'node:path';
import {Cache,readJSON,save,gh} from './io';
import {multicall} from './rpc-evidence';
import {pin} from './treasury';
export async function feeRouting(out:string,cache:Cache){
 const fees=await readJSON(join(out,'fees-reconciled.json')),rows=[];
 for(const recipient of fees.recipients){if(recipient.usd<100)continue;const [cid,address]=recipient.id.split(':'),chain=+cid,block=await pin(chain,cache.cutoff,cache);
 const methods=['feeRecipient','management','governance','owner'],sels=['0x46904840','0x88a8d602','0x5aa6e675','0x8da5cb5b'];const reads=await multicall(chain,sels.map(data=>({target:address,data})),block.number,cache);
 rows.push({...recipient,block:block.number,routes:reads.map((r,i)=>({method:methods[i],address:r.success&&r.data.length>=66?'0x'+r.data.slice(26,66).toLowerCase():null,evidence:r.evidence}))});
 }
 const docs=[];for(const path of ['repos/yearn/yearn-devdocs/contents/docs/developers/addresses/core-contracts.md','repos/yearn/yearn-devdocs/contents/src/ethereum/constants.ts','repos/yearn/yearn-security/contents/disclosures/2025-08-13.md']){const [repo,file]=path.split('/contents/');const revision=await cache.get('public-document-revision',{repo,file,cutoff:cache.cutoff},()=>gh(repo+'/commits?path='+encodeURIComponent(file)+'&until='+encodeURIComponent(cache.cutoff)+'&per_page=1'));if(!revision.data[0]?.sha)throw Error('No public document revision before cutoff');const ref=revision.data[0].sha;const r=await cache.get('fee-routing-document',{path,ref},()=>gh(path+'?ref='+ref));docs.push(r.id,revision.id)}
 await save(join(out,'fee-routing.json'),{rows,docs});console.log(JSON.stringify(rows));
}
if(import.meta.main){const out=process.argv[2],r=await readJSON(join(out,'run.json'));await feeRouting(out,new Cache(join(out,'cache'),r.cutoff));}
