import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createHandler as bulk } from '../calendar-bulk-schedule/handler.ts';
import { createHandler as recurring } from '../calendar-create-recurring-rule/handler.ts';
import { createHandler as capacity } from '../calendar-capacity-check/handler.ts';
import { calendarWorkspace, CalendarAccessError } from './calendarWorkspaceAccess.ts';
const USER='00000000-0000-4000-8000-000000000001';
const OTHER='00000000-0000-4000-8000-000000000002';
const WS='00000000-0000-4000-8000-000000000003';
type Query={table:string;admin:boolean;op:string;value?:any;filters:[string,unknown][]};
function fixture(options:{role?:string;owner?:boolean;visible?:boolean;authError?:boolean;lookupError?:boolean;eventError?:boolean}={}) {
  const queries:Query[]=[];const clients:any[]=[];
  const deps={env:(name:string)=>name==='SUPABASE_URL'?'http://test.invalid':name==='SUPABASE_SERVICE_ROLE_KEY'?'SERVICE':'ANON',
    createClient:(_url:string,key:string,config?:any)=>{
      const admin=key==='SERVICE';clients.push({admin,key,config});
      return {rpc:async(name:string,args:any)=>{
        queries.push({table:name,admin,op:'rpc',value:args,filters:[]});
        return options.eventError?{data:null,error:{code:'XX000',message:'PRIVATE_SQL_VALUE'}}:{data:{success:true,job_id:'00000000-0000-4000-8000-000000000010',events_created:args.p_events.length,events:args.p_events.map((e:any)=>({...e,workspace_id:args.p_workspace_id,created_by:USER,owner_id:USER,status:'briefing',auto_render:false}))},error:null};
      },auth:{getUser:async()=>options.authError?{data:null,error:{message:'invalid'}}:{data:{user:{id:USER}},error:null}},
      from:(table:string)=>{
        const q:Query={table,admin,op:'select',filters:[]};let done=false;
        const run=()=>{
          if(done)throw new Error('Query executed twice');done=true;queries.push(q);
          if(table==='workspaces')return {data:options.visible===false?null:{id:WS,owner_id:options.owner?USER:OTHER},error:options.lookupError?{message:'PRIVATE_LOOKUP'}:null};
          if(table==='workspace_members' && q.filters.some(([k])=>k==='user_id'))return {data:options.role?{role:options.role}:null,error:null};
          if(table==='workspace_members')return {data:[],error:null};
          if(q.op==='insert' && table==='bulk_schedule_jobs')return {data:{id:'job-1'},error:null};
          if(q.op==='insert' && table==='calendar_events')return options.eventError?{data:null,error:{message:'PRIVATE_SQL_VALUE'}}:{data:q.value.map((row:any,i:number)=>({...row,id:'event-'+i})),error:null};
          if(q.op==='insert' && table==='recurring_event_rules')return {data:{id:'rule-1',next_execution:q.value.next_execution},error:null};
          return {data:[],error:null};
        };
        const chain:any={select:()=>chain,eq:(k:string,v:unknown)=>{q.filters.push([k,v]);return chain;},gte:()=>chain,lt:()=>chain,
          insert:(value:any)=>{q.op='insert';q.value=value;return chain;},update:(value:any)=>{q.op='update';q.value=value;return chain;},
          single:async()=>run(),maybeSingle:async()=>run(),then:(ok:any,bad:any)=>Promise.resolve().then(run).then(ok,bad)};
        return chain;
      }};
    }};
  return {deps,queries,clients};
}
const bodies={bulk:{request_id:'00000000-0000-4000-8000-000000000020',workspace_id:WS,start_date:'2026-11-01',end_date:'2026-11-03',events:[{title:'Draft',channels:['instagram']}],distribution_strategy:'even'},
  recurring:{workspace_id:WS,name:'Weekly',template_event:{title:'Draft',created_by:OTHER,owner_id:OTHER,workspace_id:OTHER},recurrence_pattern:'weekly'},
  capacity:{workspace_id:WS,week_start:'2026-11-01'}};
const handlers={bulk,recurring,capacity};
function request(body:any,method='POST',authorization:string|undefined='Bearer user-token',extra:Record<string,string>={}){
  return new Request('http://test.invalid',{method,headers:{'content-type':'application/json',...(authorization?{authorization}:{}),...extra},body:method==='POST'?JSON.stringify(body):undefined});
}
for(const [name,factory] of Object.entries(handlers)) {
  Deno.test(name+': method, QA and absent/invalid auth never reach workspace data',async()=>{
    for(const [method,auth,extra,status] of [
      ['OPTIONS','',{},200],['GET','Bearer user-token',{},405],['POST','',{},401],
      ['POST','Bearer user-token',{'x-qa-mock':'true'},403],['POST','Bearer user-token',{'x-qa-real-spend':'true'},403],
    ] as const){
      const f=fixture({role:'admin'});const response=await factory(f.deps)(request(bodies[name as keyof typeof bodies],method,auth,extra));
      assertEquals(response.status,status);assertEquals(f.queries.length,0);
    }
    const f=fixture({authError:true});assertEquals((await factory(f.deps)(request(bodies[name as keyof typeof bodies]))).status,401);assertEquals(f.queries.length,0);
  });
  Deno.test(name+': another workspace or failed authorization lookup is denied before business reads/writes',async()=>{
    for(const [opts,status] of [[{visible:false},403],[{},403],[{lookupError:true},503]] as const){
      const f=fixture(opts);const response=await factory(f.deps)(request(bodies[name as keyof typeof bodies]));
      assertEquals(response.status,status);assertEquals(f.queries.some(q=>!['workspaces','workspace_members'].includes(q.table)),false);
      assertEquals(f.clients.some(c=>c.admin),false);
    }
  });
}
Deno.test('viewer can read capacity but cannot create draft events or recurring rules',async()=>{
  for(const [name,factory] of Object.entries(handlers)){
    const f=fixture({role:'viewer'});assertEquals((await factory(f.deps)(request(bodies[name as keyof typeof bodies]))).status,name==='capacity'?200:403);
    assertEquals(f.queries.some(q=>q.op!=='select'),false);
  }
});
Deno.test('editor uses one caller-authenticated atomic RPC and no direct or privileged writes',async()=>{
  const f=fixture({role:'editor'});const response=await bulk(f.deps)(request(bodies.bulk));assertEquals(response.status,200);
  const writes=f.queries.filter(q=>q.op!=='select');assertEquals(writes.length,1);
  assertEquals(writes[0].table,'schedule_calendar_bulk_atomic');assertEquals(writes[0].op,'rpc');assertEquals(writes[0].admin,false);
  assertEquals(writes[0].value.p_request_id,bodies.bulk.request_id);assertEquals(writes[0].value.p_workspace_id,WS);
  assertEquals(Object.keys(writes[0].value.p_events[0]).sort(),['brand_kit_id','caption','channels','start_at','title']);
  assertEquals(f.clients.some(c=>c.admin),false);
  assertEquals(f.clients[0].config.global.headers.Authorization,'Bearer user-token');
  const g=fixture({role:'editor'});assertEquals((await recurring(g.deps)(request(bodies.recurring))).status,403);
});
Deno.test('admin rule creation uses caller RLS and overwrites forged template actor/workspace',async()=>{
  const f=fixture({role:'admin'});assertEquals((await recurring(f.deps)(request(bodies.recurring))).status,200);
  const q=f.queries.find(q=>q.op==='insert')!;assertEquals(q.admin,false);assertEquals(q.table,'recurring_event_rules');
  assertEquals(q.value.template_event.workspace_id,WS);assertEquals(q.value.template_event.created_by,USER);assertEquals(q.value.template_event.owner_id,USER);
  assertEquals(f.clients.some(c=>c.admin),false);
});
Deno.test('owner identity is checked from workspace row; read queries remain caller-scoped',async()=>{
  const f=fixture({owner:true});assertEquals((await capacity(f.deps)(request(bodies.capacity))).status,200);
  assertEquals(f.queries.some(q=>q.admin),false);
  for(const q of f.queries.filter(q=>['calendar_events','workspace_members','user_capacity'].includes(q.table)))assertEquals(q.filters.some(([k,v])=>k==='workspace_id'&&v===WS),true);
});
Deno.test('invalid bulk dates or slots create no job and no privileged client',async()=>{
  for(const body of [{...bodies.bulk,end_date:bodies.bulk.start_date},{...bodies.bulk,events:[]},
    {...bodies.bulk,distribution_strategy:'manual',posting_slots:[]}]){
    const f=fixture({role:'editor'});assertEquals((await bulk(f.deps)(request(body))).status,400);
    assertEquals(f.queries.some(q=>q.op!=='select'),false);assertEquals(f.clients.some(c=>c.admin),false);
  }
});
Deno.test('atomic errors leak no raw SQL and never fall back to split writes',async()=>{
  const f=fixture({role:'editor',eventError:true});const response=await bulk(f.deps)(request(bodies.bulk));assertEquals(response.status,500);
  assertEquals((await response.text()).includes('PRIVATE_SQL_VALUE'),false);
  assertEquals(f.queries.filter(q=>q.op!=='select').map(q=>q.op),['rpc']);assertEquals(f.clients.some(c=>c.admin),false);
});
Deno.test('invalid workspace identifiers and unknown member roles fail closed',async()=>{
  const f=fixture({role:'unexpected'});const client=f.deps.createClient('url','ANON');
  await assertRejects(()=>calendarWorkspace(client,USER,'not-uuid','read'),CalendarAccessError);
  await assertRejects(()=>calendarWorkspace(client,USER,WS,'read'),CalendarAccessError);
});

Deno.test('missing request ID, forged event actor and overflow slots refuse RPC calls',async()=>{
  for(const body of [{...bodies.bulk,request_id:undefined},{...bodies.bulk,request_id:'bad'},
    {...bodies.bulk,events:[{title:'Forged',channels:[],created_by:OTHER}]},
    {...bodies.bulk,start_date:'2026-11-01',end_date:'2026-11-02',events:Array.from({length:20},(_,i)=>({title:String(i),channels:[]}))}]){
    const f=fixture({role:'editor'});assertEquals((await bulk(f.deps)(request(body))).status,400);
    assertEquals(f.queries.some(q=>q.op==='rpc'),false);
  }
});
Deno.test('same request produces identical normalized RPC arguments on retry',async()=>{
  const f=fixture({role:'editor'});const handler=bulk(f.deps);
  assertEquals((await handler(request(bodies.bulk))).status,200);assertEquals((await handler(request(bodies.bulk))).status,200);
  const calls=f.queries.filter(q=>q.op==='rpc');assertEquals(calls[0].value,calls[1].value);
});
Deno.test('RPC conflict, authorization, validation and missing-function codes map without exposing messages',async()=>{
  for(const [code,status] of [['PT409',409],['23505',409],['42501',403],['22023',400],['PGRST202',503],['42883',503]] as const){
    const f=fixture({role:'editor'});const original=f.deps.createClient;
    f.deps.createClient=(...args:any[])=>{const client=original(args[0],args[1],args[2]);return {...client,rpc:async()=>({data:null,error:{code,message:'PRIVATE_SQL_VALUE'}})};};
    const response=await bulk(f.deps)(request(bodies.bulk));assertEquals(response.status,status);assertEquals((await response.text()).includes('PRIVATE_SQL_VALUE'),false);
  }
});
