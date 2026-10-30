import {periods} from './periods';
import {join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {Cache,readJSON,save,hash} from './io';
import {imported} from './reuse';
const iso=(ts:number)=>new Date(ts*1000).toISOString();
export async function importBudgetState(output:string,file:string,cache:Cache) {
  const body=await readFile(file,'utf8'),data=JSON.parse(body);if(!data.proposals||!data.votes)throw Error('Expected yBudget state with proposals and votes');
  const r=await cache.get('imported-budget-state',{sha256:hash(body)},async()=>({sha256:hash(body),original:data}));
  await save(join(output,'budget-reference.json'),{id:r.id,sha256:hash(body)});return r;
}
export async function costsFromCache(output:string,cache:Cache) {
  const ref=await readJSON(join(output,'budget-reference.json')),state=(await readJSON(join(cache.directory,ref.id+'.json'))).data.original;
  const flows=await imported(output,cache,'flows.json'),escrows=await imported(output,cache,'escrows.json'),prior=await imported(output,cache,'snapshot-latest.json');
  const collection=await readJSON(join(output,'collection.json')),br=collection.sources.find((s:any)=>s.name==='budget-issues'),issues=(await readJSON(join(cache.directory,br.id+'.json'))).data;
  const budgets:any[]=[],gaps:any[]=[],reviews:any[]=[];
  const until=Date.parse(cache.cutoff),since=Date.parse(periods(cache.cutoff)[0].start);
  for(const proposal of Object.values(state.proposals) as any[]) {
    const b=proposal.budget_request_details;
    if(proposal.resolution!=='Approved'||!b?.start_date||!b?.end_date||b.is_loan)continue;
    const start=new Date(b.start_date).toISOString(),end=new Date(Date.parse(b.end_date)+(/12 mo|12 month|12-month/i.test(proposal.title)?0:86400000)).toISOString(),approvedAt=new Date(proposal.resolved_at||proposal.published_at).toISOString();
    if(Date.parse(end)<=since||Date.parse(start)>=until||Date.parse(approvedAt)>until)continue;
    const amounts=b.request_amounts??{},usd=amounts.USD??amounts.DAI??amounts.USDC??amounts.USDT;
    if(usd==null){gaps.push({kind:'non-USD approved budget',title:proposal.title,url:proposal.url,amounts});continue;}
    if(!b.payment_tx){gaps.push({kind:'approved but payment unconfirmed',title:proposal.title,url:proposal.url});}
    const title=proposal.title,issueNumber=Number((proposal.url||'').split('/').at(-1));
    let line=/supplemental.*hosting/i.test(title)?'supplemental hosting allocation':/tenderly/i.test(title)?'Tenderly annual subscription':/hosting|DNS/i.test(title)?'hosting operations':/marketing/i.test(title)?'marketing':/UX/i.test(title)?'UX consulting':/SE Hire/i.test(title)?'additional sales engineer':/WebOps/i.test(title)?'WebOps':issueNumber===326||issueNumber===325?'shared WebOps and BD':'approved operating budget';
    budgets.push({id:'ybudget:'+proposal.id,team:b.team||proposal.title,line,start,end,usd,approvedAt,evidence:[ref.id],sourceUrl:proposal.url,paymentTx:b.payment_tx});
  }
  // The later regime's executed funding claims prove paid requests; issue text supplies calendar service intervals.
  const requestMap=(await readJSON(join(import.meta.dir,'../references/budget-reviews.json'))).requests;
  for(const [key,info] of Object.entries(requestMap) as [string,any][]) {
    const issue=issues.find((r:any)=>r.number===info.issue);if(!issue)throw Error('Missing funded budget request '+info.issue);
    const claims=flows.data.fd.claims.filter((c:any)=>flows.data.fd.approvals.some((a:any)=>a.period===c.period&&a.idx===c.idx&&a.duration>0)&&String(c.teamName).toLowerCase().replace(/[^a-z]/g,'').includes(key.replace(/[^a-z]/g,''))&&c.period===info.period);
    const approvals=flows.data.fd.approvals.filter((c:any)=>String(c.teamName).toLowerCase().replace(/[^a-z]/g,'').includes(key.replace(/[^a-z]/g,''))&&c.period===info.period&&c.duration>0);
    if(!claims.length||!approvals.length){gaps.push({kind:'later request needs funding reconciliation',issue:info.issue,name:info.name});continue;}
    const body=issue.body||'',match=body.match(/### Amount \(Total\)\s*\n+\s*\$?([\d,]+(?:\.\d+)?)/i);
    let usd=match?Number(match[1].replace(/,/g,'')):null;
    if(usd==null&&info.name==='DAO-ops'){const m=body.match(/(?:\*\*)?Total[^\n]*?\$([\d,]+)/i)||body.match(/\$([\d,]+)[^\n]*total/i);if(m)usd=Number(m[1].replace(/,/g,''));}
    if(usd==null){gaps.push({kind:'request amount needs review',issue:info.issue,name:info.name});continue;}
    // These requests explicitly cover August–October, except DAO-ops' independently stated term.
    let start=info.start,end=info.end;
    const paidAt=Math.min(...claims.map((c:any)=>c.ts));
    budgets.push({id:'funded-request:'+info.issue,team:info.name,line:'approved operating budget',start,end,usd,approvedAt:iso(paidAt),evidence:[br.id,flows.evidence],sourceUrl:issue.html_url});
    reviews.push({issue:info.issue,requestUsd:usd,fundingRecordedUsd:claims.reduce((s:number,c:any)=>s+c.costUsd,0),approvedShares:approvals.reduce((s:number,c:any)=>s+c.amount,0)});
  }
  const boundaryAdjustments:any[]=[];
  for(const b of budgets)for(const next of budgets)if(b.id!==next.id&&b.team===next.team&&b.line===next.line&&Date.parse(b.end)-86400000===Date.parse(next.start)){boundaryAdjustments.push({previous:b.id,next:next.id,oldEnd:b.end,end:next.start,reason:'Shared rolling-term boundary is exclusive; count transition day once'});b.end=next.start;}
  const controlled=new Set<string>(['0x8fb66f38cf86a3d5e8768f8f1754a24a6c661fb8']); // Yearn-owned warehouse credit settlements are internal; no ownership of other users' credits is asserted.
  const addresses=await imported(output,cache,'addresses.json');
  for(const account of addresses.data.addresses['1'])if(['headline','inflight','contingent'].includes(account.tier))controlled.add(account.address.toLowerCase());
  const ownerAddresses:Record<string,string>={'ychad.eth':'0xfeb4acf3df3cdea7399794d0869ef76a6efaff52','TreasuryVault':'0x93a62da5a14c80f265dabc077fcee437b1a0efde'};
  const spendingGroups=new Set(['team-funding','vesting-escrow','team-safe','external-payment']);
  const cash:any[]=[],seen=new Set<string>();
  for(const t of flows.data.transfers.rows) {
    if(t.ts*1000<since||t.ts*1000>=until)continue;
    const mine=ownerAddresses[t.account];if(!mine)throw Error('Unknown source account');
    const from=t.dir==='out'?mine:t.counterparty.toLowerCase(),to=t.dir==='in'?mine:t.counterparty.toLowerCase();
    let kind='asset-swap';
    if(controlled.has(from)&&controlled.has(to))kind='internal';
    else if(t.dir==='out'&&(spendingGroups.has(t.group)||(t.group==='outflow-other'&&['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48','0xdac17f958d2ee523a2206206994597c13d831ec7','0x6b175474e89094c44da98b954eedeac495271d0f'].includes(t.token.toLowerCase()))))kind='spending';
    else if(t.dir==='in'&&['revenue','fee-pipeline'].includes(t.group))kind='receipt';
    if(!['spending','receipt','internal'].includes(kind))continue;
    if(['current-spot','currentSpot'].includes(t.priceMethod)){if(kind!=='internal')gaps.push({kind:'cash requires historical repricing',tx:t.tx});continue;}
    if(t.usd==null){if(kind!=='internal')gaps.push({kind:'unpriced cash record',tx:t.tx,group:t.group});continue;}
    const id=`1:${t.tx}:${t.token.toLowerCase()}:${from}:${to}:${t.amount}`;
    if(seen.has(id))continue;seen.add(id);
    cash.push({id,daoCashSettlement:t.dir==='in'&&['revenue','fee-pipeline'].includes(t.group),at:iso(t.ts),usd:t.usd,from,to,kind,evidence:[flows.evidence],sourcePriceMethod:t.priceMethod,group:t.group,classification:t.group==='outflow-other'?'External stablecoin disbursement; purpose not fully attributed':t.group});
  }
  // Transfers from treasury into FundingDistributor are internal; its claims are external spending.
  for(const c of flows.data.fd.claims) {
    if(c.ts*1000<since||c.ts*1000>=until)continue;
    const from='0xbcc932e4750c3e465a7e54a06a34f9edf8f6116b',to=(c.vest&& !/^0x0{40}$/.test(c.vest)?c.vest:c.recipient).toLowerCase();
    controlled.delete(to);cash.push({id:`fd:${c.tx}:${c.idx}`,at:iso(c.ts),usd:c.costUsd,from,to,kind:'spending',evidence:[flows.evidence],sourcePriceMethod:'event-reported USD'});
  }
  const paidAddresses=new Set(cash.filter(c=>c.kind==='spending').map(c=>c.to));
  const resolvedGaps=gaps.filter(g=>!(g.kind==='approved but payment unconfirmed'&&Object.values(state.proposals).some((p:any)=>p.url===g.url&&paidAddresses.has(p.budget_request_details?.payment_address?.toLowerCase()))));
  const result={cutoff:cache.cutoff,budgets,cash,controlledAccounts:[...controlled],gaps:resolvedGaps,reviews,boundaryAdjustments,methodology:'Operating accrual uses approved calendar service periods. Cash uses classified external disbursements and FD claims, excluding prefunds, swaps, internal transfers, holder distributions and own-token grants. Non-cash incentives are disclosed separately.'};
  await save(join(output,'costs-reconciled.json'),result);console.log(JSON.stringify({budgets:budgets.length,cash:cash.length,gaps:resolvedGaps,reviews}));return result;
}
if(import.meta.main){const out=process.argv[2],run=await readJSON(join(out,'run.json')),cache=new Cache(join(out,'cache'),run.cutoff);if(process.argv[3])await importBudgetState(out,process.argv[3],cache);await costsFromCache(out,cache);}
