import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { Header } from '@/components/Header';
import { CookieConsent } from '@/components/CookieConsent';
import { BlackTieFooter } from '@/components/landing/BlackTieFooter';
import { PricingSection } from '@/components/landing/PricingSection';
import Index from '@/pages/Index';
import Auth from '@/pages/Auth';
import { AwsForgotPassword,AwsEmailCallbackPage } from '@/pages/AwsEmailRecovery';
import FAQ from '@/pages/FAQ';
import Legal from '@/pages/Legal';
import AIVideoRefundPolicy from '@/pages/legal/AIVideoRefundPolicy';
import { tx } from '@/lib/i18nText';
import type { ReactNode } from 'react';

export function AwsPublicFrame({children}:{children:ReactNode}){
 return <><Header/>{children}<CookieConsent/></>;
}
export function isAwsPublicPath(path:string,signedIn:boolean):boolean{
 return ['/', '/auth','/forgot-password','/auth/callback','/faq','/privacy','/terms','/imprint','/support','/status','/legal','/legal/privacy','/legal/terms','/legal/imprint','/legal/avv','/legal/ai-video-refund'].includes(path)||path==='/pricing'&&!signedIn;
}
function PublicInfo(){
 const location=useLocation();
 return <><main id="main-content" className="container max-w-3xl space-y-5 py-16"><h1 className="text-3xl font-bold">{location.pathname==='/status'?tx({de:'Dienststatus',en:'Service status',es:'Estado del servicio'}):tx({de:'Kontakt',en:'Contact',es:'Contacto'})}</h1>
 <p>{location.pathname==='/status'?tx({de:'Der öffentliche Dienststatus wird während der AWS-Migration noch verbunden.',en:'Public service status is still being connected during the AWS migration.',es:'El estado público del servicio aún se está conectando durante la migración a AWS.'}):tx({de:'Support-Tickets werden während der AWS-Migration noch verbunden.',en:'Support tickets are still being connected during the AWS migration.',es:'Los tickets de soporte aún se están conectando durante la migración a AWS.'})}</p><Link to="/auth" className="text-primary underline">{tx({de:'Anmelden',en:'Sign in',es:'Iniciar sesión'})}</Link></main><BlackTieFooter/></>;
}
export default function AwsPublicSite(){
 return <AwsPublicFrame><Routes>
  <Route path="/forgot-password" element={<AwsForgotPassword/>}/><Route path="/auth/callback" element={<AwsEmailCallbackPage/>}/>
  <Route path="/" element={<Index/>}/><Route path="/auth" element={<Auth/>}/><Route path="/faq" element={<FAQ/>}/>
  <Route path="/pricing" element={<><main id="main-content"><p className="container px-4 pt-6 text-muted-foreground">{tx({de:'AWS-Vorschau: Registrierung, Generierung und Veröffentlichung werden noch verbunden.',en:'AWS preview: registration, generation and publishing are still being connected.',es:'Vista previa de AWS: el registro, la generación y la publicación aún se están conectando.'})}</p><PricingSection/></main><BlackTieFooter/></>}/>
  {['/privacy','/terms','/imprint','/legal'].map(path=><Route key={path} path={path} element={<Legal/>}/>)}
  <Route path="/legal/ai-video-refund" element={<AIVideoRefundPolicy/>}/><Route path="/legal/:page" element={<Legal/>}/>
  <Route path="/support" element={<PublicInfo/>}/><Route path="/status" element={<PublicInfo/>}/>
 </Routes></AwsPublicFrame>;
}
