import http from 'node:http';
import https from 'node:https';
export const LOCAL_FRONTEND='http://127.0.0.1:5173';
export const LOCAL_API='http://127.0.0.1:4174';
export const AWS_API='https://api-prod.useadtool.ai';
const AWS_ORIGIN='https://prodtest.useadtool.ai';
const HEADER_NAMES=['authorization','apikey','content-type','x-client-info','x-app-lang','x-supabase-api-version'];
const MAX_BODY=65536,MAX_RESPONSE=8*1024*1024;

/** Fixed HTTPS upstream. No URL, credentials, database keys or provider targets are configurable. */
export function awsRequest(path,method,headers,body){
 return new Promise((resolve,reject)=>{
  const request=https.request(new URL(path,AWS_API),{method,headers:{...headers,host:'api-prod.useadtool.ai',origin:AWS_ORIGIN,'accept-encoding':'identity','content-length':body.length},timeout:20000},response=>{
   const chunks=[];let bytes=0;
   response.on('data',chunk=>{bytes+=chunk.length;if(bytes>MAX_RESPONSE){response.destroy();reject(Error('Response bound exceeded'));}else chunks.push(chunk);});
   response.on('error',reject);response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks)}));
  });
  request.on('timeout',()=>request.destroy(Error('AWS timeout')));request.on('error',reject);request.end(body);
 });
}
export function createAwsLocalProxy({allow,upstream=awsRequest}){
 if(typeof allow!=='function')throw Error('Reviewed browser request policy required');
 return http.createServer(async(req,res)=>{
  const send=(code,body)=>{res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));};
  // Port is fixed in normal use. Tests may bind this server to another loopback port.
  const port=req.socket.localPort;
  if(req.headers.host!==`127.0.0.1:${port}`||!['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))return send(403,{error:'LOCAL_HOST_REQUIRED'});
  if(req.method==='GET'&&req.url==='/__local_health')return send(200,{kind:'ADTOOL_LOCAL_FRONTEND_REAL_AWS',frontend:LOCAL_FRONTEND,backend:AWS_API});
  if(req.headers.origin!==LOCAL_FRONTEND)return send(403,{error:'LOCAL_FRONTEND_ORIGIN_REQUIRED'});
  res.setHeader('Access-Control-Allow-Origin',LOCAL_FRONTEND);res.setHeader('Vary','Origin');
  if(typeof req.url!=='string'||!req.url.startsWith('/')||req.url.startsWith('//')||new URL(req.url,AWS_API).origin!==AWS_API)return send(404,{error:'ROUTE_UNAVAILABLE'});
  if(req.method==='OPTIONS'){
   const method=req.headers['access-control-request-method'];
   const names=String(req.headers['access-control-request-headers']??'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
   if(!(['GET','HEAD','POST'].includes(method)||method==='PUT'&&req.url==='/auth/v1/user')||names.some(n=>!HEADER_NAMES.includes(n)&&n!=='accept-profile'))return send(403,{error:'PREFLIGHT_UNAVAILABLE'});
   // Validate route and method even for preflight; public schema header is removed by the browser client.
   try{await allow(req.url,method,{});}catch{return send(404,{error:'ROUTE_UNAVAILABLE'});}
   res.writeHead(204,{'Access-Control-Allow-Methods':method,'Access-Control-Allow-Headers':HEADER_NAMES.concat('accept-profile').join(','),'Access-Control-Max-Age':'60'});return res.end();
  }
  if(!(['GET','HEAD','POST'].includes(req.method)||req.method==='PUT'&&req.url==='/auth/v1/user'))return send(404,{error:'ROUTE_UNAVAILABLE'});
  try{
   await allow(req.url,req.method,req.headers);
  }catch{return send(404,{error:'ROUTE_UNAVAILABLE'});}
  const headers={};for(const name of HEADER_NAMES)if(typeof req.headers[name]==='string')headers[name]=req.headers[name];
  if(headers['content-type']){
   // GoTrue sends JSON with a UTF-8 charset; AWS ingress expects the canonical media type.
   if(!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(headers['content-type']))return send(415,{error:'JSON_REQUIRED'});
   headers['content-type']='application/json';
  }
  let body=Buffer.alloc(0);
  try{
   for await(const chunk of req){if(body.length+chunk.length>MAX_BODY)return send(413,{error:'REQUEST_TOO_LARGE'});body=Buffer.concat([body,chunk]);}
   const result=await upstream(req.url,req.method,headers,body);
   // Never relay redirects or cookies into the development browser.
   if(result.status>=300&&result.status<400)return send(502,{error:'AWS_REDIRECT_REJECTED'});
   if(!Number.isInteger(result.status)||result.status<200||result.status>599)return send(502,{error:'AWS_RESPONSE_UNAVAILABLE'});
   res.writeHead(result.status,{'content-type':result.headers['content-type']??'application/json','cache-control':'no-store'});res.end(result.body);
  }catch{if(!res.headersSent)send(502,{error:'AWS_CONNECTION_UNAVAILABLE'});else res.destroy();}
 });
}
