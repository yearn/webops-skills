import {join} from 'node:path';
import {Cache,readJSON,save} from './io';
import {batchPrices} from './prices';
const key=(chain:number,address:string)=>chain+':'+address.toLowerCase();
export async function prepareVaults(output:string,cache:Cache) {
  const manifest=await readJSON(join(output,'collection.json')),catalogRef=await readJSON(join(output,'catalog-reference.json'));
  const catalog=(await readJSON(join(cache.directory,catalogRef.id+'.json'))).data,byId=new Map(catalog.map((r:any)=>[key(r.chain_id,r.address),r]));
  const us=manifest.sources.find((s:any)=>s.name==='kong-universe'),universe=(await readJSON(join(cache.directory,us.id+'.json'))).data;
  const registry=universe.filter((r:any)=>r.label==='vault'&&(r.defaults.yearn||r.defaults.origin==='yearn'));
  const ids=new Set(registry.map((r:any)=>key(r.chain_id,r.address))),metadata:any[]=[];
  for(const v of registry) {
    const id=key(v.chain_id,v.address),snapshot:any=(byId.get(id) as any)?.snapshot??{},hook:any=(byId.get(id) as any)?.hook??{},d=v.defaults;
    const asset=(typeof d.asset==='string'?d.asset:d.asset?.address)||snapshot.asset||snapshot.token;
    const name=snapshot.name||d.name||id;let excluded:string|null=null;
    if(d.projectName&&!['Yearn'].includes(d.projectName))excluded='External framework project: '+d.projectName;
    if(/Katana Pre-Deposit/i.test(name))excluded='Bridge/pre-deposit representation; excluded from invested Yearn vault TVL';
    if(v.chain_id===4663)excluded='Chain 4663 has no configured RPC; last indexed capital was zero and cutoff ownership cannot be independently refreshed';
    if(/Curve yETH Factory|Curve Y Pool yVault/i.test(name))excluded='Legacy compromised-pool exposure excluded from the matched vault cohort; post-exploit LP valuation history is unreliable';
    if(v.chain_id===250)excluded='Legacy Fantom excluded from covered vault cohort; bridged book values are not validated economic TVL';
    if(id==='1:0x928db6676340e5206a91ad122a24e363131ffce7')excluded='USDaf-SR LP price history is unverified and contains corrupted quotes; excluded from all matched-period vault metrics';
    if(asset&&ids.has(key(v.chain_id,asset)))excluded='Wrapper capital is represented once through its included underlying Yearn vault';
    metadata.push({id,chain:v.chain_id,address:v.address.toLowerCase(),name,symbol:snapshot.symbol||d.symbol||null,asset:asset?.toLowerCase(),decimals:Number(d.decimals??snapshot.decimals??18),v3:!!d.v3,apiVersion:d.apiVersion,activation:new Date(Number(d.inceptTime||0)*1000).toISOString(),excluded,wrapperTarget:asset&&ids.has(key(v.chain_id,asset))?key(v.chain_id,asset):null,recipient:(snapshot.accountant||snapshot.performanceFeeRecipient||snapshot.rewards||'').toLowerCase(),evidence:[us.id,catalogRef.id]});
  }
  const byMeta=new Map(metadata.map(m=>[m.id,m])),series:any[]=[];const anomalies:any[]=[];
  const supports=await readJSON(join(output,'support-reference.json'));
  for(const source of manifest.sources.filter((s:any)=>s.name==='kong-series')) {
    const r=await readJSON(join(cache.directory,source.id+'.json')),period=r.params.args[0].slice(0,7),points=new Map<string,any>();
    for(const row of r.data) {
      const id=key(row.chain_id,row.address),m=byMeta.get(id);if(!m)continue;
      const day=row.block_time.slice(0,10),k=id+'@'+day,p=points.get(k)??{id,date:day+'T00:00:00.000Z',block:Number(row.block_number),observedAt:row.block_time,evidence:[source.id]};
      if(row.label==='tvl-c') {
        if(row.component==='tvl')p.usd=row.value==null?null:Number(row.value);
        if(row.component==='totalAssets')p.assets=row.value==null?null:Number(row.value);
        if(row.component==='priceUsd')p.price=row.value==null?null:Number(row.value);
        if(row.component==='delegated')p.delegated=row.value==null?null:Number(row.value);
        p.block=Number(row.block_number);p.observedAt=row.block_time;
      } else if(row.label==='apy-bwd-delta-pps'&&row.component==='net')p.apy=row.value==null?null:Number(row.value);
      points.set(k,p);
    }

    // Cache source parameters bind the PPS batch to its month.
    for(const support of supports.refs.filter((s:any)=>s.name==='daily-share-price')) {
      const pps=await readJSON(join(cache.directory,support.id+'.json'));
      if(!pps.params.args[0].startsWith(period))continue;
      for(const row of pps.data){const id=key(row.chain_id,row.address),k=id+'@'+row.block_time.slice(0,10),p=points.get(k);if(p){p.pps=row.value==null?null:Number(row.value);p.evidence.push(support.id);}}
    }
    for(const p of points.values())if(p.assets!=null&&p.price>0&&p.usd!=null){const full=p.assets*p.price;if(Math.abs(full-p.usd)>0.01){p.originalUsd=p.usd;p.usd=full;p.roundingCorrection='Value normalized asset units before rounding to USD';}}
    const requests:any[]=[];
    for(const p of points.values()) {
      const m=byMeta.get(p.id);if(!m||m.excluded)continue;
      if(p.usd>1e10||p.price<0||p.usd<0){anomalies.push({id:p.id,date:p.date,usd:p.usd,price:p.price,assets:p.assets});if(m.asset&&m.chain===1)requests.push({key:'ethereum:'+m.asset,timestamp:Math.floor(Date.parse(p.date)/1000)+86399});}
    }
    const corrections=await batchPrices(requests,cache);
    for(const p of points.values()) {
      const m=byMeta.get(p.id);if(!m||m.excluded)continue;
      if(p.usd>1e10||p.price<0||p.usd<0){const quote=corrections.get('ethereum:'+m.asset+':'+(Math.floor(Date.parse(p.date)/1000)+86399));if(quote&&p.assets!=null){p.originalUsd=p.usd;p.price=quote.price;p.usd=p.assets*quote.price;p.evidence.push(quote.evidence);p.correction='Repriced implausible cached quote using Yearn historical daily price';}else p.valuationError='Implausible quote could not be repriced';}
    }
    const file=join(output,'vault-series',period+'.json');await save(file,{period,points:[...points.values()].filter(p=>byMeta.has(p.id))});series.push({period,file,points:points.size});
    console.log(JSON.stringify({vaultSeries:period,points:points.size,corrections:corrections.size}));
  }
  const result={cutoff:cache.cutoff,metadata,series,anomalies};await save(join(output,'vault-preparation.json'),result);return result;
}
if(import.meta.main){const out=process.argv[2],run=await readJSON(join(out,'run.json'));await prepareVaults(out,new Cache(join(out,'cache'),run.cutoff));}
