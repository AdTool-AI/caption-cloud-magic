import {createReadHandler} from '../_shared/calendarReadHandlers.ts';
import type {CalendarDeps} from '../_shared/calendarWorkspaceAccess.ts';
export const createHandler=(deps:CalendarDeps)=>createReadHandler('calendar-validate',deps);
