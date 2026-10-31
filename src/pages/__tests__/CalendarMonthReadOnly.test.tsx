import { render } from '@testing-library/react';
import { expect,it,vi } from 'vitest';
import { MonthView } from '@/components/calendar/views/MonthView';
const state=vi.hoisted(()=>({mobile:true}));
vi.mock('@/hooks/use-mobile',()=>({useIsMobile:()=>state.mobile}));
vi.mock('@/hooks/useTranslation',()=>({useTranslation:()=>({t:(key:string)=>key})}));
const posts=[{id:'one',title:'Test event',channels:['instagram'],status:'briefing',start_at:new Date().toISOString()}];
it('hides create buttons in both read-only layouts',()=>{
 for(const mobile of [true,false]){
  state.mobile=mobile;
  const {container,unmount}=render(<MonthView readOnly posts={posts} onPostClick={()=>{}} onDateClick={()=>{}}/>);
  expect(container.querySelector('.lucide-plus')).toBeNull();unmount();
 }
});
it('preserves creation controls in editable calendars',()=>{
 state.mobile=true;const {container}=render(<MonthView posts={posts} onPostClick={()=>{}} onDateClick={()=>{}}/>);
 expect(container.querySelector('.lucide-plus')).not.toBeNull();
});
