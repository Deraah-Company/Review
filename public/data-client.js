// Local data service. No remote database SDK or cloud account is required.
export const db = {};
export const rtdb = {};
export const authReady = Promise.resolve();
const shortReads=new Map();
export async function request(url, body) {
  const read=url==='/api/data'&&['list','get'].includes(body?.op),cacheable=read&&body?.ref?.collection!=='settings',key=cacheable?JSON.stringify(body):'';
  if(!read&&!['/api/heartbeat','/api/presence'].includes(url))shortReads.clear();
  const cached=cacheable&&shortReads.get(key);if(cached&&cached.until>Date.now())return structuredClone(await cached.promise);
  const promise=(async()=>{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.error||`HTTP ${response.status}`);return result;})();
  if(cacheable)shortReads.set(key,{promise,until:Date.now()+250});
  try{return structuredClone(await promise);}catch(error){if(read)shortReads.delete(key);throw error;}
}
export const collection = (_, name) => ({collection: name});
export function doc(first, ...parts) {
  return first.collection ? {collection: first.collection, id: parts[0] || crypto.randomUUID()} : {collection: parts[0], id: parts[1] || crypto.randomUUID()};
}
export const where = (field, op, value) => ({field, op, value});
export const query = (ref, ...filters) => ({...ref, filters});
function snapshot(row, ref) { return {id: ref.id, ref, exists: () => row !== null, data: () => structuredClone(row)}; }
export async function getDoc(ref) { const r = await request('/api/data', {op:'get', ref}); return snapshot(r.data, ref); }
export async function getDocs(ref) {
  const r = await request('/api/data', {op:'list', ref});
  const docs = r.rows.map(x => snapshot(x.data, {collection:ref.collection,id:x.id}));
  return {docs, empty:docs.length===0, size:docs.length, forEach: fn => docs.forEach(fn)};
}
export const setDoc = (ref, data, options={}) => request('/api/data', {op:'set',ref,data,merge:!!options.merge});
export const updateDoc = (ref, data) => request('/api/data', {op:'update',ref,data,merge:true});
export const deleteDoc = ref => request('/api/data', {op:'delete',ref});
export async function addDoc(ref, data) { const dest=doc(ref); await setDoc(dest,data); return dest; }
export const deleteField = () => ({__local_delete_field__:true});
export function writeBatch() {
  const ops=[];
  const batch={set:(ref,data,options={})=>{ops.push({op:'set',ref,data,merge:!!options.merge});return batch;},update:(ref,data)=>{ops.push({op:'update',ref,data,merge:true});return batch;},delete:ref=>{ops.push({op:'delete',ref});return batch;},commit:()=>request('/api/batch',{ops})};
  return batch;
}
function watch(load, callback, onError) {
  let stopped=false, busy=false, previous='';
  async function tick(){if(stopped||busy)return;busy=true;try{const value=await load(); const signature=JSON.stringify(value.signature);if(!stopped&&signature!==previous){previous=signature;callback(value.snapshot);}}catch(e){if(onError)onError(e);else console.warn('Local subscription:',e.message);}finally{busy=false;}}
  tick(); const timer=setInterval(tick,2000); return ()=>{stopped=true;clearInterval(timer);};
}
export function onSnapshot(ref, callback, error) {return watch(async()=>{const s=ref.id?await getDoc(ref):await getDocs(ref);return {signature:ref.id?s.data():s.docs.map(d=>[d.id,d.data()]),snapshot:s};},callback,error);}
export const rtdbRef = (_,path) => ({path});
export const rtdbServerTimestamp = () => Date.now();
export const rtdbSet = (ref,data) => request('/api/presence',{op:'set',path:ref.path,data});
export function rtdbOnValue(ref, callback) {
  return watch(async()=>{const r=await request('/api/presence',{op:'get',path:ref.path});return {signature:r.data,snapshot:{val:()=>r.data,exists:()=>r.data!=null}};},callback);
}
export const onDisconnect = () => ({set:async()=>{}}); // The server expires presence when heartbeats stop.
setInterval(()=>{fetch('/api/heartbeat',{method:'POST'}).catch(()=>{});},15000);
export async function localUpload(file) {
  const res=await fetch('/api/upload',{method:'POST',headers:{'X-File-Name':encodeURIComponent(file.name),'Content-Type':file.type||'application/octet-stream'},body:file});
  const result=await res.json();if(!res.ok)throw new Error(result.error);return result;
}
