import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, realpath } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { homedir } from 'node:os';
export const ROOT = resolve(import.meta.dir, '..');
export const VERSION = '1';
export const hash = (v: unknown) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');
export const readJSON = async (p: string) => JSON.parse(await readFile(p, 'utf8'));
export async function save(p: string, data: unknown) {
  await mkdir(dirname(p), {recursive:true,mode:0o700});
  const tmp = p+'.'+randomUUID()+'.writing';
  await writeFile(tmp, JSON.stringify(data,null,2)+'\n',{mode:0o600});
  await rename(tmp,p);
}
export async function outsideRepository(p: string) {
  // Resolve existing parents as well as symlinks before making the run directory.
  let parent=resolve(p), suffix:string[]=[];
  while (true) {
    try {parent=await realpath(parent); break;} catch {suffix.unshift(parent.split('/').at(-1)!);const next=dirname(parent);if(next===parent)throw Error('Cannot resolve output');parent=next;}
  }
  const result=resolve(parent,...suffix), repo=await realpath(resolve(ROOT,'../..'));
  if(result===repo||result.startsWith(repo+'/')) throw Error('Output and raw evidence must be outside the repository.');
  return result;
}
export function defaultOutput(cutoff:string) {
  return join(process.env.XDG_STATE_HOME||join(homedir(),'.local/state'),'yearn-protocol-health',cutoff.replace(/[:.]/g,'-'));
}
export class Cache {
  constructor(public directory:string,public cutoff:string, public offline=false) {}
  key(source:string,params:unknown){return hash({version:VERSION,source,params,cutoff:this.cutoff});}
  async get(source:string,params:unknown,fn:()=>Promise<unknown>) {
    const id=this.key(source,params), path=join(this.directory,id+'.json');
    try {
      const saved=await readJSON(path);
      if(saved.id!==id||hash(saved.data)!==saved.digest) throw Error('Corrupt cache');
      return saved;
    } catch(error:any) {if(error.code!=='ENOENT') throw Error(`Cache integrity failure: ${id}`);}
    if(this.offline) throw Error(`Offline cache miss: ${source} ${id}`);
    const data=await fn();
    const record={id,source,params,cutoff:this.cutoff,retrievedAt:new Date().toISOString(),digest:hash(data),data};
    await save(path,record);return record;
  }
}
export async function request(url:string, options:RequestInit={}) {
  const r=await fetch(url,{...options,signal:AbortSignal.timeout(30000)});
  if(!r.ok) throw Error(`HTTP ${r.status}`); // Never log credential-bearing URLs or response bodies.
  return r;
}
export async function json(url:string,options:RequestInit={}) {return (await request(url,options)).json();}
export async function gh(endpoint:string) {
  const proc=Bun.spawn(['gh','api',endpoint],{stdout:'pipe',stderr:'pipe'});
  const [out]=await Promise.all([new Response(proc.stdout).text(),new Response(proc.stderr).text()]);
  if(await proc.exited!==0) throw Error('GitHub API failed; verify gh authentication and repository access.');
  return JSON.parse(out);
}
export async function ghPages(endpoint:string) {
  const all:any[]=[];
  for(let page=1;;page++) {
    const value=await gh(`${endpoint}${endpoint.includes('?')?'&':'?'}per_page=100&page=${page}`);
    if(!Array.isArray(value)) throw Error('Expected paginated GitHub array');
    all.push(...value);if(value.length<100) return all;
  }
}
