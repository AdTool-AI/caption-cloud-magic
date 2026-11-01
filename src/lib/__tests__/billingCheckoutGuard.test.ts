import {expect,it,vi,afterEach} from 'vitest';
import {validateBillingCheckout,founderCouponMatches} from '../../../supabase/functions/_shared/billingCheckoutGuard';
import * as guard from '../../../supabase/functions/_shared/billingCheckoutGuard';
import {STRIPE_SUBSCRIPTION_PRICES} from '../../../supabase/functions/_shared/stripe-config';
import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import ts from 'typescript';
const origin='https://prodtest.useadtool.ai';
const request=(body:unknown={packId:'starter',currency:'EUR'},headers:Record<string,string>={})=>new Request('https://api.example/checkout',{method:'POST',headers:{Origin:origin,Authorization:'Bearer synthetic.jwt.token','Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
afterEach(()=>vi.restoreAllMocks());
it('preserves the original request body for the handler',async()=>{const req=request();expect(await validateBillingCheckout(req,'credits',origin)).toBeNull();expect(await req.json()).toEqual({packId:'starter',currency:'EUR'});});
it.each(['EUR','USD','GBP'])('accepts the existing %s subscription price',async currency=>{expect(await validateBillingCheckout(request({priceId:STRIPE_SUBSCRIPTION_PRICES[currency as keyof typeof STRIPE_SUBSCRIPTION_PRICES]}),'subscription',origin)).toBeNull();});
it.each([{priceId:'price_foreign'},{priceId:STRIPE_SUBSCRIPTION_PRICES.EUR,user_id:'foreign'},{priceId:STRIPE_SUBSCRIPTION_PRICES.EUR,applyIntro:'yes'},{priceId:STRIPE_SUBSCRIPTION_PRICES.EUR,promoCode:42}])('rejects invalid subscription fields %j',async body=>{expect((await validateBillingCheckout(request(body),'subscription',origin))?.status).toBe(400);});
it.each([{packId:'starter',currency:'JPY'},{packId:'unknown',currency:'EUR'},{packId:'starter',currency:'EUR',base_amount:999},[],null,'not JSON'])('rejects invalid credit fields %j',async body=>{expect((await validateBillingCheckout(request(body),'credits',origin))?.status).toBe(400);});
it('refuses methods, missing JWT, foreign origin and QA headers',async()=>{
 expect((await validateBillingCheckout(new Request('https://api.example'),'credits',origin))?.status).toBe(405);
 expect((await validateBillingCheckout(request(undefined,{Authorization:''}),'credits',origin))?.status).toBe(401);
 expect((await validateBillingCheckout(request(undefined,{Origin:'https://foreign.example'}),'credits',origin))?.status).toBe(403);
 expect((await validateBillingCheckout(request(undefined,{'x-qa-mock':'true'}),'credits',origin))?.status).toBe(403);
});
it('requires configured HTTPS return origin',async()=>{for(const url of [undefined,'http://prodtest.useadtool.ai',origin+'/foreign'])expect((await validateBillingCheckout(request(),'credits',url))?.status).toBe(503);});
it('bounds request bytes',async()=>{expect((await validateBillingCheckout(request('x'.repeat(16385)),'credits',origin))?.status).toBe(413);});
it('requires the exact existing valid 10 percent coupon',()=>{expect(founderCouponMatches({valid:true,percent_off:10,amount_off:null})).toBe(true);for(const value of [null,{valid:false,percent_off:10},{valid:true,percent_off:20},{valid:true,percent_off:10,amount_off:100},{valid:true,percent_off:10,deleted:true}])expect(founderCouponMatches(value)).toBe(false);});
function fixture(coupon:unknown){
 let handler!:(req:Request)=>Promise<Response>;
 const create=vi.fn(),customersList=vi.fn(),retrieve=vi.fn().mockResolvedValue(coupon);
 const supabase={auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:'10000000-0000-4000-8000-000000000001',email:'synthetic@example.invalid',role:'authenticated',is_anonymous:false}},error:null})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{plan:'basic'},error:null})})})}),rpc:async()=>({data:true,error:null})};
 const stripe={coupons:{retrieve},customers:{list:customersList,create},checkout:{sessions:{create}}};
 const source=readFileSync(resolve('supabase/functions/ai-video-purchase-credits/index.ts'),'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const require=(name:string)=>name.includes('billingCheckoutGuard')?guard:name.includes('stripeCreditPacks')?{CREDIT_PACKS:{starter:{credits:9,bonus:0,bonusPercent:0}},STRIPE_PRICE_IDS:{starter:{EUR:'price_synthetic'}}}:name.includes('stripe-config')?{FOUNDERS_CREDIT_COUPON:'FOUNDERS_VIDEO_10',FOUNDERS_CREDIT_DISCOUNT_PERCENT:10}:name==='npm:stripe@18.5.0'?{default:class{constructor(){return stripe;}}}:name.startsWith('npm:@supabase')?{createClient:()=>supabase}:name.includes('/http/server.ts')?{serve:(fn:any)=>{handler=fn;}}:name.includes('i18n')?{withLang:(_req:Request,fn:any)=>fn(),tl:()=>''}:{};
 new Function('require','module','exports','Deno',code)(require,{exports:{}},{},{env:{get:(key:string)=>key==='APP_URL'?origin:'synthetic'}});
 return {handler,create,customersList,retrieve};
}
it('actual checkout blocks a missing Founders coupon before customer or payment creation',async()=>{const f=fixture(null);expect((await f.handler(request())).status).toBe(503);expect(f.retrieve).toHaveBeenCalledWith('FOUNDERS_VIDEO_10');expect(f.customersList).not.toHaveBeenCalled();expect(f.create).not.toHaveBeenCalled();});
it('actual checkout rejects a foreign origin before Stripe access',async()=>{const f=fixture(null);expect((await f.handler(request(undefined,{Origin:'https://foreign.example'}))).status).toBe(403);expect(f.retrieve).not.toHaveBeenCalled();expect(f.customersList).not.toHaveBeenCalled();});
