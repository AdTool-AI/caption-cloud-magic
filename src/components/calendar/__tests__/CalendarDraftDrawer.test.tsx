import { act, fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CalendarDraftDrawer } from '../CalendarDraftDrawer';
const state=vi.hoisted(()=>({actor:'a',reads:[] as any[],edit:vi.fn(),single:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:state.actor}})}));
vi.mock('@/hooks/useCalendarDraftEdit',()=>({useCalendarDraftEdit:()=>({edit:state.edit,pending:false})}));
vi.mock('@/lib/i18nText',()=>({tx:(text:any)=>text.en}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>({select:()=>({eq:()=>({eq:()=>({single:state.single})})})})}}));
vi.mock('@/components/ui/sheet',()=>({Sheet:({children}:any)=><div>{children}</div>,SheetContent:({children}:any)=><div>{children}</div>,SheetHeader:({children}:any)=><div>{children}</div>,SheetTitle:({children}:any)=><h1>{children}</h1>}));
const row={id:'event-a',workspace_id:'workspace-a',status:'briefing',version:1,updated_at:'2026-10-31T10:00:00.123456Z',title:'Original title',brief:null,caption:'Text',start_at:null,end_at:null,timezone:'UTC'};
const props={open:true,eventId:row.id,workspaceId:row.workspace_id,onClose:vi.fn(),onUpdate:vi.fn()};
beforeEach(()=>{state.actor='a';state.edit.mockReset();state.single.mockReset();props.onUpdate.mockReset();});afterEach(cleanup);
it('ignores a previous account load after an account switch',async()=>{
 let release!:(value:any)=>void;
 state.single.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;})).mockResolvedValueOnce({data:{...row,title:'B account title'},error:null});
 const {rerender}=render(<CalendarDraftDrawer {...props}/>);state.actor='b';rerender(<CalendarDraftDrawer {...props}/>);
 await screen.findByDisplayValue('B account title');await act(async()=>{release({data:row,error:null});});expect(screen.queryByDisplayValue('Original title')).toBeNull();
});
it('sends only changed fields with the loaded version',async()=>{
 state.single.mockResolvedValue({data:row,error:null});state.edit.mockResolvedValue({event:{...row,title:'Saved title',version:2}});
 render(<CalendarDraftDrawer {...props}/>);const input=await screen.findByLabelText('Title');fireEvent.change(input,{target:{value:'Saved title'}});fireEvent.click(screen.getByRole('button',{name:'Save draft'}));
 await screen.findByText('Draft saved.');expect(state.edit).toHaveBeenCalledWith(row,{title:'Saved title'});expect(props.onUpdate).toHaveBeenCalledOnce();
});
it('does not show success when a scope change suppresses the receipt',async()=>{
 state.single.mockResolvedValue({data:row,error:null});state.edit.mockResolvedValue(null);render(<CalendarDraftDrawer {...props}/>);
 fireEvent.change(await screen.findByLabelText('Title'),{target:{value:'Changed'}});fireEvent.click(screen.getByRole('button',{name:'Save draft'}));await waitFor(()=>expect(state.edit).toHaveBeenCalledOnce());
 expect(props.onUpdate).not.toHaveBeenCalled();expect(screen.queryByText('Draft saved.')).toBeNull();
});
it('never renders previous account data after closing and reopening',async()=>{
 state.single.mockResolvedValueOnce({data:row,error:null}).mockResolvedValueOnce({data:null,error:{message:'private detail'}});
 const {rerender}=render(<CalendarDraftDrawer {...props}/>);await screen.findByDisplayValue('Original title');rerender(<CalendarDraftDrawer {...props} open={false}/>);rerender(<CalendarDraftDrawer {...props}/>);
 await screen.findByText('Could not load this draft. Try again.');expect(screen.queryByDisplayValue('Original title')).toBeNull();expect(screen.queryByText('private detail')).toBeNull();
});
