import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import AwsMediaPreviewCheck from '../AwsMediaPreviewCheck';
const mocks=vi.hoisted(()=>({getUser:vi.fn(),preview:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getUser:mocks.getUser}}}));
vi.mock('@/lib/awsMediaAccess',()=>({readAwsMediaPreview:mocks.preview}));
const actor='10000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002';
const reference='https://api-prod.useadtool.ai/storage/v1/object/authenticated/media-assets/'+actor+'/migration-smoke/image.png';
const url='https://api-prod.useadtool.ai/storage/v1/object/sign/media-assets/'+actor+'/migration-smoke/image.png?token=h.p.s';
beforeEach(()=>{vi.clearAllMocks();mocks.getUser.mockResolvedValue({data:{user:{id:actor}},error:null});mocks.preview.mockResolvedValue(url);});
function open(value=reference){fireEvent.change(screen.getByLabelText('Private image reference'),{target:{value}});fireEvent.click(screen.getByRole('button',{name:'Open private image'}));}
it('signs an owned image with the current caller and renders only a memory preview',async()=>{
 render(<AwsMediaPreviewCheck userId={actor}/>);open();const img=await screen.findByAltText('Private AWS image preview');expect(img).toHaveAttribute('src',url);expect(img).toHaveAttribute('referrerpolicy','no-referrer');expect(mocks.preview.mock.calls[0].slice(1)).toEqual([actor,reference]);expect(screen.getByRole('status')).toHaveTextContent('15 minutes');
});
it('rejects a foreign reference before any Auth or signing request',async()=>{
 render(<AwsMediaPreviewCheck userId={actor}/>);open(reference.replace(actor,other));await screen.findByText(/Image preview unavailable/);expect(mocks.getUser).not.toHaveBeenCalled();expect(mocks.preview).not.toHaveBeenCalled();
});
it('checks the actual signed-in user before signing',async()=>{
 mocks.getUser.mockResolvedValue({data:{user:{id:other}},error:null});render(<AwsMediaPreviewCheck userId={actor}/>);open();await screen.findByText(/Image preview unavailable/);expect(mocks.preview).not.toHaveBeenCalled();
});
it('discards an in-flight preview after an account change',async()=>{
 let resolve!:(url:string)=>void;mocks.preview.mockReturnValue(new Promise<string>(r=>resolve=r));const {rerender}=render(<AwsMediaPreviewCheck userId={actor}/>);open();await waitFor(()=>expect(mocks.preview).toHaveBeenCalled());rerender(<AwsMediaPreviewCheck userId={other}/>);await act(async()=>resolve(url));expect(screen.queryByAltText('Private AWS image preview')).not.toBeInTheDocument();expect(screen.getByLabelText('Private image reference')).toHaveValue('');
});
it('does not expose server errors or retain a failed link',async()=>{
 mocks.preview.mockRejectedValue(Error('PRIVATE_STORAGE_DETAIL'));render(<AwsMediaPreviewCheck userId={actor}/>);open();await screen.findByText(/Image preview unavailable/);expect(document.body).not.toHaveTextContent('PRIVATE_STORAGE_DETAIL');expect(screen.queryByAltText('Private AWS image preview')).not.toBeInTheDocument();
});
it('clears an image that fails to download and permits a fresh signed link',async()=>{
 render(<AwsMediaPreviewCheck userId={actor}/>);open();fireEvent.error(await screen.findByAltText('Private AWS image preview'));expect(screen.queryByAltText('Private AWS image preview')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Open private image'}));await screen.findByAltText('Private AWS image preview');expect(mocks.preview).toHaveBeenCalledTimes(2);
});
