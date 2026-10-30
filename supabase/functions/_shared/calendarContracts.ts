import { CalendarAccessError } from './calendarWorkspaceAccess.ts';
export const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const minutes=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=10080;
export function dateOnly(value:unknown):Date{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new CalendarAccessError(400,'INVALID_WEEK_START');
  const date=new Date(value+'T00:00:00.000Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value||value<'2000-01-01'||value>'2100-12-24')throw new CalendarAccessError(400,'INVALID_WEEK_START');
  return date;
}
export async function bodyObject(req:Request,keys:string[]):Promise<Record<string,any>>{
  if(Number(req.headers.get('content-length')??0)>65536)throw new CalendarAccessError(413,'REQUEST_TOO_LARGE');
  const reader=req.body?.getReader();const chunks:Uint8Array[]=[];let size=0;
  if(reader)try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;
    if(size>65536){await reader.cancel();throw new CalendarAccessError(413,'REQUEST_TOO_LARGE');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new CalendarAccessError(400,'INVALID_REQUEST');}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!keys.includes(k)))throw new CalendarAccessError(400,'INVALID_REQUEST');
  return body;
}
export async function readRows(query:any):Promise<any[]>{
  // Request an explicit count: silently truncated PostgREST results cannot be labelled complete.
  const result=await query;
  if(result.error||!Array.isArray(result.data)||result.data.length>=1000||result.count!==result.data.length)throw new CalendarAccessError(503,'CAPACITY_LOOKUP_FAILED');
  return result.data;
}
