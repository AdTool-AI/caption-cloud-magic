import { useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { TranslationContext, useTranslation, useTranslationState } from '@/hooks/useTranslation';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { AppHeader } from '@/components/layout/AppHeader';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import { hubDefinitions } from '@/config/hubConfig';
import { hubCovers } from '@/config/hubCovers';
import HubPage from '@/pages/HubPage';
import AwsValidation from '@/pages/AwsValidation';
import AwsCalendarPage from '@/pages/AwsCalendarPage';

const cache = new QueryClient();
function Home() {
  const { t } = useTranslation();
  return <div className="mx-auto max-w-6xl space-y-8 p-6 md:p-10">
    <div><h1 className="font-heading text-3xl font-bold">Your AdTool workspace</h1><p className="mt-2 text-muted-foreground">Plan your content and explore your workspace.</p></div>
    <Button asChild><Link to="/calendar">Open calendar</Link></Button>
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{hubDefinitions.filter(h => !h.adminOnly && !h.comingSoon).map(hub => <Link key={hub.key} to={'/hub/'+hub.key} className="group relative overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:border-primary/60">
      {hubCovers[hub.key] && <img src={hubCovers[hub.key]} alt="" className="h-36 w-full object-cover transition group-hover:scale-105"/>}
      <div className="p-5"><h2 className="font-heading text-xl font-semibold">{t(hub.titleKey)}</h2><p className="mt-2 text-sm text-muted-foreground">{t(hub.descKey)}</p></div>
    </Link>)}</div>
  </div>;
}
function Unavailable() {
  return <div className="mx-auto max-w-3xl space-y-4 p-8"><h1 className="text-2xl font-semibold">This feature is being connected to AWS</h1><p>Your account is signed in. This destination is not available on AWS yet.</p><Button asChild><Link to="/home">Back to workspace</Link></Button><Button asChild variant="outline" className="ml-3"><Link to="/calendar">Open calendar</Link></Button></div>;
}
function CommandCenter() {
  const location=useLocation();const view=new URLSearchParams(location.search).get('view');
  return !view || view==='calendar' ? <AwsCalendarPage/> : <Unavailable/>;
}
function WorkspaceHub() {
  const {hubKey}=useParams();
  return hubDefinitions.find(h=>h.key===hubKey)?.adminOnly ? <Unavailable/> : <HubPage/>;
}
function SignedInLayout() {
  const {user,session,loading,requiresMfa}=useAuth();const [menu,setMenu]=useState(false);
  if (loading) return <p role="status" className="p-8">Checking sessionâ€¦</p>;
  if (!user || !session || session.user.id!==user.id || requiresMfa) return <AwsValidation/>;
  return <SidebarProvider><div className="flex min-h-screen w-full min-w-0">
    <AppSidebar/>
    <div className="flex min-w-0 flex-1 flex-col"><AppHeader/>
      <div className="border-b bg-muted/50 px-4 py-2 text-sm">AWS Â· Calendar reads available. Editing, generation and publishing are still being connected.</div>
      <nav aria-label="Workspace navigation" className="flex flex-wrap items-center gap-4 border-b px-4 py-3">
        <Link to="/home">Home</Link><Link to="/hub/planen">Planning</Link><Link to="/calendar">Calendar</Link><Link to="/connection-check">Connection check</Link>
        <button onClick={()=>setMenu(!menu)} className="md:hidden" aria-expanded={menu}>More sections</button>
        {menu && hubDefinitions.filter(h=>!h.adminOnly&&!h.comingSoon).map(h=><Link key={h.key} to={'/hub/'+h.key} onClick={()=>setMenu(false)}>{h.key}</Link>)}
      </nav>
      <main className="min-w-0 flex-1"><ErrorBoundary><Routes>
        <Route path="/" element={<Navigate to="/home" replace/>}/><Route path="/home" element={<Home/>}/>
        <Route path="/auth" element={<Navigate to="/home" replace/>}/>
        <Route path="/hub/:hubKey" element={<WorkspaceHub/>}/>
        <Route path="/calendar" element={<AwsCalendarPage key={session.access_token}/>}/>
        <Route path="/command-center" element={<CommandCenter key={session.access_token}/>}/>
        <Route path="/connection-check" element={<AwsValidation/>}/>
        <Route path="*" element={<Unavailable/>}/>
      </Routes></ErrorBoundary></main>
    </div>
  </div></SidebarProvider>;
}
export default function AwsApplication() {
  const translation=useTranslationState();
  return <QueryClientProvider client={cache}><BrowserRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><TranslationContext.Provider value={translation}><AuthProvider><TooltipProvider><Sonner/><SignedInLayout/></TooltipProvider></AuthProvider></TranslationContext.Provider></BrowserRouter></QueryClientProvider>;
}
