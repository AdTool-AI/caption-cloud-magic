import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve,relative,join,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const sourceExtensions=new Set(['.ts','.tsx','.js','.mjs']);
const isTest=path=>/(?:^|\/)(?:__tests__|test|tests)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path);
export function scanSource(text,name){
 const sf=ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true,name.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const routes=new Set(),functions=new Set(),tables=new Set(),environment=new Set(),legacy=new Set();
 function walk(node){
  if((ts.isJsxSelfClosingElement(node)||ts.isJsxOpeningElement(node))&&node.tagName.getText(sf)==='Route'){
   for(const a of node.attributes.properties)if(ts.isJsxAttribute(a)&&a.name.getText(sf)==='path'&&a.initializer&&ts.isStringLiteral(a.initializer))routes.add(a.initializer.text);
  }
  if(ts.isCallExpression(node)){
   const expr=node.expression;
   if(ts.isPropertyAccessExpression(expr)&&node.arguments.length&&ts.isStringLiteral(node.arguments[0])){
    const value=node.arguments[0].text;
    if(expr.name.text==='invoke')functions.add(value);
    if(expr.name.text==='from')tables.add(value);
    if(expr.getText(sf)==='Deno.env.get')environment.add(value);
   }
  }
  // Inspect executable string literals, not comments or test text. No keys or
  // complete literal values are exported: dependency categories only.
  if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)||ts.isTemplateHead(node)){
   if(/https?:\/\/(?:[a-z0-9.-]+\.)?(?:lovable\.dev|lovableproject\.com)(?:\/|$)/i.test(node.text))legacy.add('lovable_runtime_endpoint');
   if(/^LOVABLE_[A-Z0-9_]*(?:KEY|TOKEN|SECRET)$/.test(node.text))legacy.add('lovable_provider_key');
  }
  ts.forEachChild(node,walk);
 }
 walk(sf);
 return {routes:[...routes].sort(),functionCalls:[...functions].sort(),tableReferences:[...tables].sort(),environmentNames:[...environment].sort(),legacyDependencies:[...legacy].sort()};
}
function files(root){
 const out=[];
 for(const entry of readdirSync(root,{withFileTypes:true})){if(entry.isSymbolicLink())continue;const path=join(root,entry.name);if(entry.isDirectory())out.push(...files(path));else if(entry.isFile()&&sourceExtensions.has(extname(path)))out.push(path);}
 return out.sort();
}
export function audit(root){
 const sources=[];
 for(const directory of ['src','supabase/functions'])for(const path of files(join(root,directory))){
  const name=relative(root,path).replaceAll('\\','/');if(isTest(name))continue;
  const facts=scanSource(readFileSync(path,'utf8'),name);
  if(facts.routes.length||facts.functionCalls.length||facts.tableReferences.length||facts.environmentNames.length||facts.legacyDependencies.length)sources.push({path:name,...facts});
 }
 const routeSource=sources.find(s=>s.path==='src/App.tsx');
 const entrypoints=readdirSync(join(root,'supabase/functions'),{withFileTypes:true}).filter(e=>e.isDirectory()&&!e.name.startsWith('_')).map(e=>e.name).filter(name=>{try{return readFileSync(join(root,'supabase/functions',name,'index.ts')).length>0;}catch{return false;}}).sort();
 const legacy=sources.filter(s=>s.legacyDependencies.length).map(({path,legacyDependencies})=>({path,categories:legacyDependencies}));
 return {schemaVersion:1,scope:'static_source_inventory_not_live_acceptance',productionReady:false,backendOrigin:'https://api-prod.useadtool.ai',summary:{originalRoutes:routeSource?.routes.length??0,functionEntrypoints:entrypoints.length,legacyDependentSourceFiles:legacy.length,browserFunctionCalls:new Set(sources.filter(s=>s.path.startsWith('src/')).flatMap(s=>s.functionCalls)).size},originalRoutes:routeSource?.routes??[],functionEntrypoints:entrypoints,legacyDependencies:legacy,sources};
}
export function newLegacyDependencies(report,baseline){
 if(baseline.schemaVersion!==1||!Array.isArray(baseline.legacyDependencies))throw Error('Invalid migration baseline');
 const accepted=new Map(baseline.legacyDependencies.map(r=>[r.path,new Set(r.categories)]));
 return report.legacyDependencies.filter(r=>r.categories.some(c=>!accepted.get(r.path)?.has(c)));
}
export function main(args=process.argv.slice(2),root=process.cwd()){
 const report=audit(root);const out=args.indexOf('--out');
 if(out>=0){if(!args[out+1]||args[out+1].startsWith('--'))throw Error('Output path required');writeFileSync(resolve(args[out+1]),JSON.stringify(report,null,2)+'\n');}
 if(args.includes('--check-no-new-legacy')){
  const baseline=JSON.parse(readFileSync(join(root,'scripts/aws-migration-baseline.json'),'utf8'));
  const added=newLegacyDependencies(report,baseline);
  if(added.length)throw Error('New Lovable runtime dependencies: '+added.map(r=>r.path).join(', '));
 }
 console.log(JSON.stringify({scope:report.scope,productionReady:false,...report.summary},null,2));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main();
