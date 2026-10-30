import {calendarRequestGuard,calendarUser,calendarWorkspace,calendarError,CalendarAccessError,type CalendarDeps} from './calendarWorkspaceAccess.ts';
import {bodyObject,uuid} from './calendarContracts.ts';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-app-lang'};
export const ENTRIES=['planner-conflicts','calendar-validate','calendar-export','calendar-export-pdf'] as const;
type Entry=typeof ENTRIES[number];
const platform=(v:unknown):v is string=>typeof v==='string'&&/^[a-z][a-z0-9_-]{0,39}$/.test(v);
export function instant(v:unknown):Date{
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v))throw new CalendarAccessError(400,'INVALID_DATE');
 if(Number(v.slice(11,13))>23||Number(v.slice(14,16))>59||Number(v.slice(17,19))>59)throw new CalendarAccessError(400,'INVALID_DATE');
 const day=v.slice(0,10);const d=new Date(day+'T00:00:00Z');const parsed=new Date(v);
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==day||!Number.isFinite(parsed.getTime())||day<'2000-01-01'||day>'2100-12-31')throw new CalendarAccessError(400,'INVALID_DATE');
 return parsed;
}
async function rows(query:any){
 const {data,error,count}=await query;
 if(error||!Array.isArray(data)||data.length>=1000||count!==data.length)throw new CalendarAccessError(503,'CALENDAR_READ_FAILED');
 return data as any[];
}
function range(from:unknown,to:unknown,maxDays=366){
 const start=instant(from),end=instant(to);
 if(end<=start||end.getTime()-start.getTime()>maxDays*86400000)throw new CalendarAccessError(400,'INVALID_RANGE');
 return [start,end];
}
function csvCell(v:unknown){const s=String(v??'');return '"'+((/^\s*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s))?"'"+s:s).replace(/"/g,'""')+'"';}
export function csv(posts:any[],language='de'){
 const names:Record<string,string[]>={de:['Datum','Uhrzeit','Plattform','Status','Caption'],en:['Date','Time','Platform','Status','Caption'],es:['Fecha','Hora','Plataforma','Estado','Caption']};
 return [names[language].map(csvCell).join(','),...posts.map(p=>{const d=instant(p.scheduled_at).toISOString();return [d.slice(0,10),d.slice(11,16),p.platform,p.status,p.caption].map(csvCell).join(',');})].join('\r\n')+'\r\n';
}
const icsText=(v:unknown)=>String(v??'').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
function fold(line:string){let result='',bytes=0;for(const c of line){const size=new TextEncoder().encode(c).length;if(bytes+size>75){result+='\r\n ';bytes=1;}result+=c;bytes+=size;}return result;}
const icsDate=(d:Date)=>d.toISOString().replace(/[-:]/g,'').slice(0,15)+'Z';
export function ics(posts:any[]){
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//AdTool//Calendar//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
 for(const p of posts){
  if(!uuid(p.id))throw new CalendarAccessError(503,'INVALID_EXPORT_DATA');
  const start=instant(p.scheduled_at);
  lines.push('BEGIN:VEVENT','UID:'+p.id+'@socialmediaplanner','DTSTAMP:'+icsDate(new Date()),'DTSTART:'+icsDate(start),'DTEND:'+icsDate(new Date(start.getTime()+1800000)),
   'SUMMARY:'+icsText('Post: '+p.platform),'DESCRIPTION:'+icsText(p.caption),'STATUS:'+(p.status==='posted'?'CONFIRMED':'TENTATIVE'),'END:VEVENT');
 }lines.push('END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
}
export const htmlEscape=(value:unknown)=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
function printHtml(events:any[],month:number,year:number,brand:any){
 const color=typeof brand?.primary_color==='string'&&/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(brand.primary_color)?brand.primary_color:'#000000';
 let logo='';try{const url=new URL(brand?.logo_url);if(url.protocol==='https:'&&!url.username&&!url.password)logo='<img alt="Brand logo" style="max-width:150px" src="'+htmlEscape(url.href)+'">';}catch{/* No validated optional logo. */}
 const title=new Date(Date.UTC(year,month-1,1)).toLocaleDateString('en-US',{month:'long',year:'numeric',timeZone:'UTC'});
 return '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; img-src https:; base-uri &#39;none&#39;; form-action &#39;none&#39;"><title>'+htmlEscape(title)+' Content Calendar</title><style>body{font-family:Arial;padding:32px}h1{color:'+color+'}table{border-collapse:collapse;width:100%}td,th{padding:8px;border:1px solid #ddd;text-align:left}</style></head><body>'+logo+'<h1>'+htmlEscape(title)+' Content Calendar</h1><table><thead><tr><th>Date UTC</th><th>Title</th><th>Channels</th><th>Status</th></tr></thead><tbody>'+events.map(e=>'<tr><td>'+htmlEscape(instant(e.start_at).toISOString().slice(0,10))+'</td><td>'+htmlEscape(e.title)+'</td><td>'+htmlEscape(Array.isArray(e.channels)?e.channels.join(', '):'')+'</td><td>'+htmlEscape(e.status)+'</td></tr>').join('')+'</tbody></table></body></html>';
}
async function validate(client:any,b:any){
 if(typeof b.caption!=='string'||b.caption.length>20000||!Array.isArray(b.platforms)||!b.platforms.length||b.platforms.length>20||b.platforms.some((v:unknown)=>!platform(v))||new Set(b.platforms).size!==b.platforms.length||
  (b.media!==undefined&&(!Array.isArray(b.media)||b.media.length>20||b.media.some((m:any)=>!m||typeof m!=='object'||Array.isArray(m)||Object.keys(m).some(k=>!['type','ratio'].includes(k))||!['image','video'].includes(m.type)||(m.ratio!==undefined&&(typeof m.ratio!=='string'||!/^\d{1,3}:\d{1,3}$/.test(m.ratio)))))))throw new CalendarAccessError(400,'INVALID_VALIDATION_REQUEST');
 const scheduled=b.scheduled_at===undefined?null:instant(b.scheduled_at);
 const limits=await rows(client.from('platform_limits').select('platform,max_caption_length,max_hashtags,max_media_count,supported_ratios,rate_limit_per_hour',{count:'exact'}).in('platform',b.platforms));
 if(new Set(limits.map(l=>l.platform)).size!==limits.length)throw new CalendarAccessError(503,'INVALID_PLATFORM_LIMITS');
 const result:Record<string,any>={},warnings:string[]=[],errors:string[]=[],missing:string[]=[];let complete=true;
 for(const name of b.platforms){
  const l=limits.find(row=>row.platform===name);
  if(!l){missing.push(name);complete=false;warnings.push('No limits configured for '+name);continue;}
  const fields=['max_caption_length','max_hashtags','max_media_count','rate_limit_per_hour'];
  if(fields.some(k=>l[k]!==null&&(!Number.isInteger(l[k])||l[k]<0))||(l.supported_ratios!==null&&(!Array.isArray(l.supported_ratios)||l.supported_ratios.some((r:unknown)=>typeof r!=='string'))))throw new CalendarAccessError(503,'INVALID_PLATFORM_LIMITS');
  if(fields.some(k=>l[k]===null)||l.supported_ratios===null)complete=false;
  const issues:string[]=[];const media=b.media??[];
  const caption_ok=l.max_caption_length!==null&&b.caption.length<=l.max_caption_length;
  const media_ok=l.max_media_count!==null&&media.length<=l.max_media_count;
  if(!caption_ok)issues.push('Caption limit unavailable or exceeded');if(!media_ok)issues.push('Media limit unavailable or exceeded');
  if(l.max_hashtags!==null&&(b.caption.match(/#\w+/g)??[]).length>l.max_hashtags)warnings.push(name+': Too many hashtags');
  if(l.supported_ratios?.length&&media.some((m:any)=>m.ratio&&!l.supported_ratios.includes(m.ratio)))warnings.push(name+': Unsupported media ratio');
  let rate_limit_ok:boolean|null=null;
  if(scheduled&&l.rate_limit_per_hour!==null){
   const start=new Date(scheduled);start.setUTCMinutes(0,0,0);const end=new Date(start.getTime()+3600000);
   const count=await client.from('calendar_events').select('id',{head:true,count:'exact'}).eq('workspace_id',b.workspace_id).contains('channels',[name]).gte('start_at',start.toISOString()).lt('start_at',end.toISOString()).in('status',['scheduled','queued','published']);
   if(count.error||!Number.isInteger(count.count)||count.count<0)throw new CalendarAccessError(503,'CALENDAR_READ_FAILED');
   rate_limit_ok=count.count<l.rate_limit_per_hour;if(!rate_limit_ok){issues.push('Hourly limit reached');warnings.push(name+': Hourly limit reached');}
  }
  errors.push(...issues);result[name]={caption_ok,media_ok,rate_limit_ok,issues};
 }
 return {ok:complete&&errors.length===0,complete,warnings,errors,missing_platform_limits:missing,platform_results:result,rate_limit_scope:'workspace_local',provider_limits_certified:false};
}
export function createReadHandler(slug:Entry,deps:CalendarDeps){return async(req:Request)=>{
 const early=calendarRequestGuard(req,headers);if(early)return early;
 try{
  const {client,user}=await calendarUser(req,deps);
  const keys:Record<Entry,string[]>={'planner-conflicts':['workspace_id','platform','start_at','end_at','exclude_id'],'calendar-validate':['caption','platforms','media','workspace_id','scheduled_at'],'calendar-export':['from','to','platform','format','language'],'calendar-export-pdf':['workspace_id','brand_kit_id','month','year']};
  const b=await bodyObject(req,keys[slug]);
  if(slug==='calendar-export'){
   const now=new Date();const [start,end]=range(b.from??now.toISOString(),b.to??new Date(now.getTime()+7*86400000).toISOString());
   if((b.platform!==undefined&&!platform(b.platform))||(b.format!==undefined&&!['csv','ics'].includes(b.format))||(b.language!==undefined&&!['de','en','es'].includes(b.language)))throw new CalendarAccessError(400,'INVALID_EXPORT_REQUEST');
   let query=client.from('posts').select('id,scheduled_at,platform,status,caption',{count:'exact'}).eq('user_id',user.id).gte('scheduled_at',start.toISOString()).lte('scheduled_at',end.toISOString());if(b.platform!==undefined)query=query.eq('platform',b.platform);
   const posts=await rows(query.order('scheduled_at',{ascending:true}));if(!posts.length)throw new CalendarAccessError(404,'NO_POSTS_IN_RANGE');
   if(posts.some(p=>typeof p.platform!=='string'||typeof p.status!=='string'||(p.caption!==null&&typeof p.caption!=='string')))throw new CalendarAccessError(503,'INVALID_EXPORT_DATA');
   const format=b.format??'ics';return new Response(format==='csv'?csv(posts,b.language??'de'):ics(posts),{headers:{...headers,'Content-Type':format==='csv'?'text/csv; charset=utf-8':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="calendar-export.'+format+'"'}});
  }
  await calendarWorkspace(client,user.id,b.workspace_id,'read');
  if(slug==='planner-conflicts'){
   const [start,end]=range(b.start_at,b.end_at);if(!platform(b.platform)||(b.exclude_id!==undefined&&!uuid(b.exclude_id)))throw new CalendarAccessError(400,'INVALID_CONFLICT_REQUEST');
   let query=client.from('schedule_blocks').select('id,workspace_id,weekplan_id,platform,start_at,end_at,status',{count:'exact'}).eq('workspace_id',b.workspace_id).eq('platform',b.platform).lt('start_at',end.toISOString()).gt('end_at',start.toISOString());
   if(b.exclude_id!==undefined)query=query.neq('id',b.exclude_id);return Response.json({conflicts:await rows(query)},{headers});
  }
  if(slug==='calendar-validate')return Response.json(await validate(client,b),{headers});
  if(!Number.isInteger(b.year)||b.year<2000||b.year>2100||!Number.isInteger(b.month)||b.month<1||b.month>12||(b.brand_kit_id!=null&&!uuid(b.brand_kit_id)))throw new CalendarAccessError(400,'INVALID_EXPORT_REQUEST');
  let brand=null;if(b.brand_kit_id!=null){const found=await client.from('brand_kits').select('id,primary_color,logo_url').eq('id',b.brand_kit_id).eq('user_id',user.id).maybeSingle();if(found.error)throw new CalendarAccessError(503,'CALENDAR_READ_FAILED');if(!found.data)throw new CalendarAccessError(403,'BRAND_FORBIDDEN');brand=found.data;}
  const start=new Date(Date.UTC(b.year,b.month-1,1)),end=new Date(Date.UTC(b.year,b.month,1));
  let query=client.from('calendar_events').select('id,start_at,title,status,channels',{count:'exact'}).eq('workspace_id',b.workspace_id).gte('start_at',start.toISOString()).lt('start_at',end.toISOString()).order('start_at',{ascending:true});if(b.brand_kit_id!=null)query=query.eq('brand_kit_id',b.brand_kit_id);
  const events=await rows(query);return Response.json({html:printHtml(events,b.month,b.year,brand),events_count:events.length,output_kind:'printable_html',pdf_generated:false},{headers});
 }catch(error){return calendarError(error,headers);}
};}
