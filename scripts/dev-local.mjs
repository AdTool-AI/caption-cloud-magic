import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { createAwsLocalProxy,LOCAL_FRONTEND,LOCAL_API,AWS_API } from './aws-local-proxy.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
let vite,proxy;
async function close(){await Promise.allSettled([vite?.close(),proxy?new Promise(resolve=>proxy.close(resolve)):undefined]);}
try{
 vite=await createServer({root,mode:'aws-local'});
 proxy=createAwsLocalProxy({allow:async(path,method,headers)=>{
  const {createAwsValidationFetch}=await vite.ssrLoadModule('/src/lib/awsValidationFetch.ts');
  // Exercise the same exact route/query policy as the browser. This fetcher never sends traffic.
  await createAwsValidationFetch(async()=>new Response(null,{status:204}),AWS_API)(AWS_API+path,{method,headers});
 }});
 await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(4174,'127.0.0.1',resolve);});
 await vite.listen();
 console.log(`\nLocal frontend: ${LOCAL_FRONTEND}\nReal AWS backend: ${AWS_API}\nLoopback development proxy: ${LOCAL_API}\nSign in using your existing controlled AWS account. Saves change real AWS data.\nPress Ctrl+C to stop.\n`);
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void close().then(()=>process.exit(0)));
}catch(error){console.error('Local AWS development could not start:',error.code??error.message);await close();process.exitCode=1;}
