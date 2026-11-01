import { useEffect, useRef, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { AI_VIDEO_CREDIT_PACKS, type AIVideoCreditPackId } from '@/config/aiVideoCredits';
import { BETA_BASIC_PRICE_EUR, type PaymentCurrency } from '@/config/stripe';
import { billingProfile, creditReturn, startBillingCheckout, verifyBillingCredits, type BillingProfile } from '@/lib/awsBilling';
import { Button } from '@/components/ui/button';

export default function AwsBillingPage(){
 const {session}=useAuth();const location=useLocation();
 const [profile,setProfile]=useState<BillingProfile|null>(null);const [currency,setCurrency]=useState<PaymentCurrency>('EUR');
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [checkout,setCheckout]=useState('');const [attempted,setAttempted]=useState(false);
 const [balance,setBalance]=useState<number|null>(null);const pending=useRef(false);const current=useRef(session?.access_token);current.current=session?.access_token;
 const token=session?.access_token;const actor=session?.user.id;const returnId=location.pathname==='/ai-video-studio'?creditReturn(location.search):null;
 const local=window.location.origin==='http://127.0.0.1:5173';
 async function refresh(){
  if(!token||!actor||pending.current)return;
  const scoped=token;pending.current=true;setBusy(true);setMessage('');setProfile(null);
  try{
   const {data,error}=await supabase.from('profiles').select('*').setHeader('Authorization','Bearer '+token);
   if(error)throw Error('The account plan could not be loaded.');
   const value=billingProfile(data,actor);if(current.current===scoped)setProfile(value);
  }catch{if(current.current===scoped)setMessage('The account plan could not be loaded. Refresh before purchasing.');}
  finally{pending.current=false;if(current.current===scoped)setBusy(false);}
 }
 useEffect(()=>{current.current=token;setProfile(null);setCheckout('');setAttempted(false);setBalance(null);void refresh();return()=>{current.current=undefined;};},[token,actor]);
 async function create(pack:AIVideoCreditPackId|null){
  if(!profile||!token||pending.current||attempted)return;
  const scoped=token;pending.current=true;setBusy(true);setAttempted(true);setMessage('');
  try{const url=await startBillingCheckout((slug,options)=>supabase.functions.invoke(slug,options),profile,token,currency,pack);if(current.current===scoped)setCheckout(url);}
  catch(error){if(current.current===scoped)setMessage(error instanceof Error?error.message:'Checkout needs review.');}
  finally{pending.current=false;if(current.current===scoped)setBusy(false);}
 }
 async function verify(){
  if(!returnId||!token||pending.current)return;
  const scoped=token;pending.current=true;setBusy(true);setMessage('');
  try{const amount=await verifyBillingCredits((slug,options)=>supabase.functions.invoke(slug,options),returnId,token);if(current.current===scoped){setBalance(amount);setMessage('Your credit purchase is verified.');}}
  catch(error){if(current.current===scoped)setMessage(error instanceof Error?error.message:'Payment verification needs review.');}
  finally{pending.current=false;if(current.current===scoped)setBusy(false);}
 }
 const money=(amount:number)=>new Intl.NumberFormat('en',{style:'currency',currency}).format(amount);
 return <section className="mx-auto max-w-4xl space-y-6 p-6 md:p-10">
  <h1 className="text-3xl font-bold">Billing</h1>
  <p>Manage your Beta-Basic subscription and credit purchases. Stripe shows the final total before you confirm payment.</p>
  <p className="rounded border border-amber-400 p-4">Live payments. Subscriptions renew monthly. Generation and publishing are still unavailable during migration.</p>
  {local&&<p>Checkout returns to prodtest.useadtool.ai. The updated billing screen must be deployed there before completing a payment.</p>}
  {location.pathname==='/welcome'&&<p role="status">Checkout returned. Refresh your account below to check whether the paid subscription has been activated. This page does not confirm payment by itself.</p>}
  {(new URLSearchParams(location.search).get('payment')==='canceled'||new URLSearchParams(location.search).get('canceled')==='true')&&<p role="status">Checkout was canceled. No payment is confirmed by this page.</p>}
  <div className="flex flex-wrap items-center gap-4"><p>Account plan: <strong>{profile?.plan??'Checking...'}</strong></p><Button variant="outline" disabled={busy} onClick={()=>void refresh()}>Refresh account</Button></div>
  {returnId&&balance===null&&<Button disabled={busy} onClick={()=>void verify()}>Verify credit purchase</Button>}
  {balance!==null&&<p role="status">Verified wallet balance: {balance.toFixed(2)} credits</p>}
  {message&&<p role="alert">{message}</p>}
  <label className="block">Payment currency <select aria-label="Payment currency" className="ml-3 rounded border bg-background p-2" value={currency} disabled={busy||attempted} onChange={e=>setCurrency(e.target.value as PaymentCurrency)}><option>EUR</option><option>USD</option><option>GBP</option></select></label>
  {checkout?<div className="space-y-3 rounded border p-5"><p>Your checkout is ready. Review the amount and renewal terms on Stripe before paying.</p><Button asChild><a href={checkout} rel="noreferrer">Continue on Stripe</a></Button></div>:<>
   <div className="space-y-3 rounded border p-5"><h2 className="text-xl font-semibold">Beta-Basic</h2><p>{money(BETA_BASIC_PRICE_EUR)} per month. Credit packs are purchased separately.</p><Button disabled={!profile||profile.plan!=='free'||busy||attempted} onClick={()=>void create(null)}>Open subscription checkout</Button></div>
   <h2 className="text-xl font-semibold">Credit packs</h2><p>An active paid subscription is required. Any eligible Founders discount is applied by the server at checkout.</p>
   <div className="grid gap-4 sm:grid-cols-2">{(Object.keys(AI_VIDEO_CREDIT_PACKS) as AIVideoCreditPackId[]).map(id=>{const pack=AI_VIDEO_CREDIT_PACKS[id];return <div className="space-y-3 rounded border p-5" key={id}><h3 className="font-semibold capitalize">{id}</h3><p>{money(pack.price.EUR)} · {pack.totalCredits.EUR.toFixed(2)} credits</p><Button disabled={!profile||profile.plan==='free'||busy||attempted} onClick={()=>void create(id)}>Open {id} checkout</Button></div>;})}</div>
  </>}
  <Link className="underline" to="/calendar">Back to calendar</Link>
 </section>;
}
