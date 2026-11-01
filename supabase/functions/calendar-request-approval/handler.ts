import {createApprovalHandler} from '../_shared/approvalHandlers.ts';
import type {CalendarDeps} from '../_shared/calendarWorkspaceAccess.ts';
export const createHandler=(deps:CalendarDeps)=>createApprovalHandler(deps,'request');
