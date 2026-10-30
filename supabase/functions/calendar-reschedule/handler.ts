import {createWriteHandler} from '../_shared/calendarWriteHandlers.ts';
import type {CalendarDeps} from '../_shared/calendarWorkspaceAccess.ts';
export const createHandler=(deps:CalendarDeps)=>createWriteHandler('calendar-reschedule',deps);
