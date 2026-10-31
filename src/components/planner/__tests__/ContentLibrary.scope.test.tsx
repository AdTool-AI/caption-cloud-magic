import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({user:{id:'A'} as any,campaign:'',read:vi.fn(),from:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:m.user})}));
vi.mock('@/lib/i18nText',()=>({tx:(v:any)=>v.en}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:m.from}}));
vi.mock('react-router-dom',()=>({useSearchParams:()=>[new URLSearchParams(m.campaign?'campaign_id='+m.campaign:''),vi.fn()],useNavigate:()=>vi.fn()}));
vi.mock('@dnd-kit/core',()=>({useDraggable:()=>({attributes:{},listeners:{},setNodeRef:()=>{},transform:null})}));
import {ContentLibrary} from '../ContentLibrary';
const reply=(data:any,error:any=null)=>({data,error});
function deferred(){let resolve!:(v:any)=>void;const promise=new Promise(r=>{resolve=r});return {promise,resolve};}
beforeEach(()=>{
 m.user={id:'A'};m.campaign='';m.from.mockReset();m.read.mockReset().mockResolvedValue(reply([]));
 m.from.mockImplementation(()=>{const filters:any={};const q:any={};for(const name of ['select','order'])q[name]=()=>q;
 q.eq=(k:string,v:any)=>{filters[k]=v;return q};q.or=(v:string)=>{filters.search=v;return q};
 q.then=(a:any,b:any)=>Promise.resolve(m.read({...filters})).then(a,b);return q;});
});
afterEach(cleanup);
describe('Content library response ownership',()=>{
 it('shows an explicit read failure, then retries without a write',async()=>{
  m.read.mockResolvedValueOnce(reply(null,{message:'denied'})).mockResolvedValueOnce(reply([{id:'b',workspace_id:'W',title:'Loaded draft'}]));
  render(<ContentLibrary workspaceId="W" onContentSelect={vi.fn()}/>);
  await screen.findByRole('alert');expect(screen.queryByText('No content found')).toBeNull();
  fireEvent.click(screen.getByText('Retry'));await screen.findByText('Loaded draft');expect(m.read).toHaveBeenCalledTimes(2);
 });
 it('does not report a partial campaign read as success',async()=>{
  m.campaign='C';m.read.mockImplementation((f:any)=>Promise.resolve(f.source==='ai'?reply(null,{message:'denied'}):reply([{id:f.source,workspace_id:'W',title:'Partial draft'}])));
  render(<ContentLibrary workspaceId="W" onContentSelect={vi.fn()}/>);await screen.findByRole('alert');expect(screen.queryByText('Partial draft')).toBeNull();
 });
 it('hides previous workspace rows immediately and ignores the late response',async()=>{
  const late=deferred();m.read.mockImplementation((f:any)=>f.workspace_id==='WA'?late.promise:reply([{id:'b',workspace_id:'WB',title:'B draft'}]));
  const view=render(<ContentLibrary workspaceId="WA" onContentSelect={vi.fn()}/>);
  await waitFor(()=>expect(m.read).toHaveBeenCalled());view.rerender(<ContentLibrary workspaceId="WB" onContentSelect={vi.fn()}/>);
  await screen.findByText('B draft');await act(async()=>late.resolve(reply([{id:'a',workspace_id:'WA',title:'A draft'}])));
  expect(screen.queryByText('A draft')).toBeNull();expect(screen.getByText('B draft')).toBeTruthy();
 });
 it('ignores a previous account even when the workspace ID stays the same',async()=>{
  const late=deferred();m.read.mockImplementationOnce(()=>late.promise).mockResolvedValue(reply([{id:'b',workspace_id:'W',title:'B draft'}]));
  const view=render(<ContentLibrary workspaceId="W" onContentSelect={vi.fn()}/>);await waitFor(()=>expect(m.read).toHaveBeenCalledTimes(1));
  m.user={id:'B'};view.rerender(<ContentLibrary workspaceId="W" onContentSelect={vi.fn()}/>);await screen.findByText('B draft');
  await act(async()=>late.resolve(reply([{id:'a',workspace_id:'W',title:'A draft'}])));expect(screen.queryByText('A draft')).toBeNull();
 });
 it('uses the latest search result when searches finish in reverse order',async()=>{
  const late=deferred();m.read.mockImplementation((f:any)=>f.search?.includes('first')?late.promise:reply(f.search?[{id:'b',workspace_id:'W',title:'Latest result'}]:[]));
  render(<ContentLibrary workspaceId="W" onContentSelect={vi.fn()}/>);await screen.findByText('No content found');
  fireEvent.change(screen.getByPlaceholderText('Search...'),{target:{value:'first'}});await waitFor(()=>expect(m.read).toHaveBeenCalledWith(expect.objectContaining({search:expect.stringContaining('first')})));
  fireEvent.change(screen.getByPlaceholderText('Search...'),{target:{value:'second'}});await screen.findByText('Latest result');
  await act(async()=>late.resolve(reply([{id:'a',workspace_id:'W',title:'Outdated result'}])));expect(screen.queryByText('Outdated result')).toBeNull();
 });
 it('rejects cross-workspace rows',async()=>{
  m.read.mockResolvedValue(reply([{id:'x',workspace_id:'OTHER',title:'Foreign draft'}]));render(<ContentLibrary workspaceId="W" onContentSelect={vi.fn()}/>);
  await screen.findByRole('alert');expect(screen.queryByText('Foreign draft')).toBeNull();
 });
 it('does not query while signed out',async()=>{m.user=null;render(<ContentLibrary workspaceId="W" onContentSelect={vi.fn()}/>);await act(async()=>{});expect(m.read).not.toHaveBeenCalled();});
});
