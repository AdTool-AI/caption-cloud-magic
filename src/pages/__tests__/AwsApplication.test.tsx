import { fireEvent,render,screen } from '@testing-library/react';
import { beforeEach,expect,it,vi } from 'vitest';
import Application from '@/components/aws/AwsApplication';
vi.unmock('react-router-dom');
const mocks=vi.hoisted(()=>({auth:{current:null as any}}));
vi.mock('@/hooks/useAuth',()=>({AuthProvider:({children}:any)=>children,useAuth:()=>mocks.auth.current}));
vi.mock('@/hooks/useTranslation',()=>({TranslationContext:{Provider:({children}:any)=>children},useTranslation:()=>({t:(s:string)=>s}),useTranslationState:()=>({})}));
vi.mock('@/components/AppSidebar',()=>({AppSidebar:()=> <aside>Original sidebar</aside>}));
vi.mock('@/components/layout/AppHeader',()=>({AppHeader:()=> <header>Original header</header>}));
vi.mock('@/components/ui/sidebar',()=>({SidebarProvider:({children}:any)=>children}));
vi.mock('@/components/ui/sonner',()=>({Toaster:()=>null}));
vi.mock('@/pages/HubPage',()=>({default:()=> <h1>Original hub page</h1>}));
vi.mock('@/pages/AwsCalendarPage',()=>({default:()=> <h1>Workspace calendar</h1>}));
vi.mock('@/pages/AwsValidation',()=>({default:()=> <h1>Sign in or verify session</h1>}));
vi.mock('@/config/hubConfig',()=>({hubDefinitions:[{key:'planen',titleKey:'Planning hub',descKey:'Plan content',items:[]},{key:'admin',adminOnly:true,titleKey:'Admin',items:[]}]}));
vi.mock('@/config/hubCovers',()=>({hubCovers:{}}));
beforeEach(()=>{window.history.replaceState({},'','/home');mocks.auth.current={user:{id:'one'},session:{user:{id:'one'},access_token:'synthetic'},loading:false,requiresMfa:false};});
it('opens the application shell and navigates to the calendar instead of the validation screen',()=>{
 render(<Application/>);expect(screen.getByText('Original sidebar')).toBeInTheDocument();expect(screen.getByText('Original header')).toBeInTheDocument();expect(screen.getByRole('heading',{name:'Your AdTool workspace'})).toBeInTheDocument();fireEvent.click(screen.getByRole('link',{name:'Open calendar'}));expect(screen.getByRole('heading',{name:'Workspace calendar'})).toBeInTheDocument();
});
it('restores original hub routes',()=>{
 window.history.replaceState({},'','/hub/planen');render(<Application/>);expect(screen.getByRole('heading',{name:'Original hub page'})).toBeInTheDocument();
});
it('does not mount an unsupported feature or an admin hub',()=>{
 window.history.replaceState({},'','/hub/admin');render(<Application/>);expect(screen.getByRole('heading',{name:'This feature is being connected to AWS'})).toBeInTheDocument();expect(screen.queryByRole('heading',{name:'Original hub page'})).not.toBeInTheDocument();
});
it('does not silently send unsupported command-center tabs to the calendar',()=>{
 window.history.replaceState({},'','/command-center?view=campaigns');render(<Application/>);expect(screen.queryByRole('heading',{name:'Workspace calendar'})).not.toBeInTheDocument();expect(screen.getByRole('heading',{name:'This feature is being connected to AWS'})).toBeInTheDocument();
});
it('does not mount application pages for signed-out or MFA-incomplete sessions',()=>{
 mocks.auth.current.requiresMfa=true;render(<Application/>);expect(screen.getByRole('heading',{name:'Sign in or verify session'})).toBeInTheDocument();expect(screen.queryByText('Original sidebar')).not.toBeInTheDocument();
});
