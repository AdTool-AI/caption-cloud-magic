import { fireEvent,render,screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach,expect,it,vi } from 'vitest';
import { Header } from '@/components/Header';
import AwsPublicSite,{isAwsPublicPath} from '@/components/aws/AwsPublicSite';
import {saveConsent,initConsent} from '@/lib/consent';
vi.unmock('react-router-dom');
const m=vi.hoisted(()=>({user:null as any,from:vi.fn(),signout:vi.fn()}));
vi.mock('@/lib/backendTarget',()=>({isAwsTestBackend:true}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:m.user,signOut:m.signout})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:m.from}}));
vi.mock('@/components/NotificationBell',()=>({NotificationBell:()=>{throw Error('Unaccepted notifications mounted');}}));
vi.mock('@/components/LanguageSwitcher',()=>({LanguageSwitcher:()=> <button>EN</button>}));
vi.mock('@/components/ui/ThemeToggle',()=>({ThemeToggle:()=> <button>Theme</button>}));
vi.mock('@/hooks/useTranslation',()=>({useTranslation:()=>({language:'en',t:(key:string)=>({home:'Home','nav.pricing':'Pricing','nav.faq':'FAQ','auth.login':'Sign in','hero.cta':'Start for free','auth.account':'Account','auth.logout':'Sign out'}[key]??key)})}));
vi.mock('@/pages/Index',()=>({default:()=> <><h1>Original homepage</h1><div>Original footer</div></>}));
vi.mock('@/pages/Auth',()=>({default:()=> <><h1>Original login</h1><div>Original footer</div></>}));
vi.mock('@/pages/FAQ',()=>({default:()=> <h1>Original FAQ</h1>}));
vi.mock('@/pages/Legal',()=>({default:()=> <h1>Original legal page</h1>}));
vi.mock('@/pages/legal/AIVideoRefundPolicy',()=>({default:()=> <h1>Original refund policy</h1>}));
vi.mock('@/components/CookieConsent',()=>({CookieConsent:()=> <section>Cookie preferences</section>}));
vi.mock('@/components/landing/PricingSection',()=>({PricingSection:()=> <h1>Public pricing</h1>}));
vi.mock('@/components/landing/BlackTieFooter',()=>({BlackTieFooter:()=> <div>Original footer</div>}));
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();m.user=null;document.querySelectorAll('script[data-category]').forEach(s=>s.remove());});
it('shows the original homepage with header and consent rather than a login gate',()=>{
 render(<MemoryRouter initialEntries={['/']}><AwsPublicSite/></MemoryRouter>);expect(screen.getByRole('heading',{name:'Original homepage'})).toBeInTheDocument();expect(screen.getByRole('banner')).toBeInTheDocument();expect(screen.getByText('Original footer')).toBeInTheDocument();expect(screen.getByText('Cookie preferences')).toBeInTheDocument();
});
it('navigates from the public homepage to the complete login layout',()=>{
 render(<MemoryRouter><AwsPublicSite/></MemoryRouter>);fireEvent.click(screen.getAllByRole('link',{name:'Sign in'})[0]);expect(screen.getByRole('heading',{name:'Original login'})).toBeInTheDocument();expect(screen.getByRole('banner')).toBeInTheDocument();expect(screen.getByText('Original footer')).toBeInTheDocument();
});
it('makes pricing, FAQ and legal routes available without granting app access',()=>{
 for(const path of ['/','/auth','/faq','/pricing','/legal/privacy','/terms'])expect(isAwsPublicPath(path,false)).toBe(true);
 for(const path of ['/calendar','/planner','/billing','/welcome','/ai-video-studio','/admin'])expect(isAwsPublicPath(path,false)).toBe(false);
 expect(isAwsPublicPath('/pricing',true)).toBe(false);
});
it('keeps the signed-in public header free of unaccepted profile queries and notifications',()=>{
 m.user={id:'actor'};render(<MemoryRouter><Header/></MemoryRouter>);expect(m.from).not.toHaveBeenCalled();expect(screen.getByRole('link',{name:'Dashboard'})).toHaveAttribute('href','/home');expect(screen.queryByRole('link',{name:'Community'})).not.toBeInTheDocument();
});
it('stores cookie choices without activating tracking scripts on AWS',()=>{
 const script=document.createElement('script');script.type='text/plain';script.dataset.category='analytics';script.dataset.src='https://analytics.example.invalid/script.js';document.head.appendChild(script);
 const gtag=vi.fn();window.gtag=gtag;
 saveConsent({necessary:true,analytics:true,marketing:true,comfort:true,locale:'en'});expect(initConsent()).toBe(true);expect(JSON.parse(localStorage.getItem('cg_consent_v1')!).analytics).toBe(true);expect(document.querySelector('script[src="https://analytics.example.invalid/script.js"]')).toBeNull();expect(gtag).not.toHaveBeenCalled();delete window.gtag;
});
