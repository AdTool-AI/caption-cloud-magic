import { calendarRequestGuard, calendarUser, calendarWorkspace, calendarError, CalendarAccessError, type CalendarDeps } from './calendarWorkspaceAccess.ts';
import { bodyObject, dateOnly, uuid } from './calendarContracts.ts';
export type ApprovalAction = 'request' | 'approve' | 'reject';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-lang' };
function instant(x: unknown): x is string {
  if (typeof x !== 'string' || !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(x) ||
      Number(x.slice(11,13))>23 || Number(x.slice(14,16))>59 || Number(x.slice(17,19))>59 || !Number.isFinite(Date.parse(x))) return false;
  try { dateOnly(x.slice(0,10)); return true; } catch { return false; }
}
function authenticatedSubject(req: Request, userId: string) {
  // getUser has already verified the token. Reading claims here only narrows access.
  try {
    const token = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? '';
    const parts=token.split('.'); if(parts.length!==3 || token.length>16384) throw new Error();
    const payload=parts[1].replace(/-/g,'+').replace(/_/g,'/');
    const claims=JSON.parse(atob(payload.padEnd(Math.ceil(payload.length/4)*4,'=')));
    if(claims.role!=='authenticated' || claims.sub!==userId) throw new Error();
  } catch { throw new CalendarAccessError(401,'UNAUTHORIZED'); }
}
function rpcFailure(error: any): never {
  if(error?.code==='42501') throw new CalendarAccessError(403,'APPROVAL_FORBIDDEN');
  if(error?.code==='P0002') throw new CalendarAccessError(404,'APPROVAL_RECORD_NOT_FOUND');
  if(error?.code==='PT409') throw new CalendarAccessError(409,'APPROVAL_CONFLICT');
  if(error?.code==='PT410') throw new CalendarAccessError(410,'APPROVAL_EXPIRED');
  if(error?.code==='22023' && error?.message==='REQUEST_ID_REUSED') throw new CalendarAccessError(409,'REQUEST_ID_REUSED');
  if(['22023','22007','22008','22P02','23514'].includes(error?.code)) throw new CalendarAccessError(400,'INVALID_APPROVAL_REQUEST');
  throw new CalendarAccessError(503,'APPROVAL_RETRY_REQUIRED');
}
export function createApprovalHandler(deps: CalendarDeps, action: ApprovalAction) {
  if(!['request','approve','reject'].includes(action)) throw new Error('Unsupported approval action');
  return async(req: Request): Promise<Response> => {
    const early=calendarRequestGuard(req,headers); if(early) return early;
    try {
      const {client,user}=await calendarUser(req,deps); authenticatedSubject(req,user.id);
      const body=await bodyObject(req,action==='request'
        ? ['request_id','workspace_id','event_id','expected_updated_at','expected_version','approver_ids','expires_at']
        : ['request_id','workspace_id','approval_id','comment']);
      if(!uuid(body.request_id)) throw new CalendarAccessError(400,'REQUEST_ID_REQUIRED');
      let payload: Record<string,unknown>;
      if(action==='request') {
        if(!uuid(body.event_id) || !instant(body.expected_updated_at) || !Number.isInteger(body.expected_version) || body.expected_version<1 || body.expected_version>2147483647 ||
          !instant(body.expires_at) || !Array.isArray(body.approver_ids) || body.approver_ids.length<1 || body.approver_ids.length>10 ||
          body.approver_ids.some((id:unknown)=>!uuid(id)) || new Set(body.approver_ids.map((id:string)=>id.toLowerCase())).size!==body.approver_ids.length)
          throw new CalendarAccessError(400,'INVALID_APPROVAL_REQUEST');
        payload={event_id:body.event_id,expected_updated_at:body.expected_updated_at,expected_version:body.expected_version,approver_ids:body.approver_ids,expires_at:body.expires_at};
      } else {
        if(!uuid(body.approval_id) || (body.comment!=null && (typeof body.comment!=='string' || body.comment.length>4000))) throw new CalendarAccessError(400,'INVALID_APPROVAL_REQUEST');
        payload={approval_id:body.approval_id,decision:action==='approve'?'approved':'rejected'};
        if(body.comment!==undefined) payload.comment=body.comment;
      }
      await calendarWorkspace(client,user.id,body.workspace_id,action==='request'?'edit':'read');
      const {data,error}=await client.rpc(action==='request'?'request_calendar_approval_atomic':'decide_calendar_approval_atomic',
        {p_request_id:body.request_id,p_workspace_id:body.workspace_id,p_body:payload});
      if(error) rpcFailure(error);
      const invalid=()=>{throw new CalendarAccessError(503,'APPROVAL_RETRY_REQUIRED');};
      if(!data || data.publication_enabled!==false || !uuid(data.event_id)) invalid();
      if(action==='request') {
        if(data.event_id.toLowerCase()!==body.event_id.toLowerCase() || !uuid(data.batch_id) || !instant(data.expires_at) ||
          !Array.isArray(data.approvals) || data.approvals.length!==body.approver_ids.length) invalid();
        const reviewers=new Set(body.approver_ids.map((id:string)=>id.toLowerCase())), approvals=new Set<string>();
        const rows=data.approvals.map((row:any)=>{
          if(!row || !uuid(row.approval_id) || !uuid(row.approver_id) || !reviewers.delete(row.approver_id.toLowerCase()) || approvals.has(row.approval_id.toLowerCase())) invalid();
          approvals.add(row.approval_id.toLowerCase());return {approval_id:row.approval_id,approver_id:row.approver_id};
        });
        return Response.json({batch_id:data.batch_id,event_id:data.event_id,approvals:rows,expires_at:data.expires_at,publication_enabled:false},{headers});
      }
      if(!uuid(data.approval_id) || data.approval_id.toLowerCase()!==body.approval_id.toLowerCase() || data.decision!==payload.decision || typeof data.all_approved!=='boolean') invalid();
      return Response.json({approval_id:data.approval_id,event_id:data.event_id,decision:data.decision,all_approved:data.all_approved,publication_enabled:false},{headers});
    } catch(error) { return calendarError(error,headers); }
  };
}
