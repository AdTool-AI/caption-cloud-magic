import test from 'node:test';
import assert from 'node:assert/strict';
import {scanSource,newLegacyDependencies} from './audit-aws-migration.mjs';
test('extracts route and literal backend contracts without exporting secret literals',()=>{
 const r=scanSource(`const view=<Route path="/calendar" element={<Calendar/>}/>;client.functions.invoke('generate-caption',{});client.from('profiles');Deno.env.get('REPLICATE_API_KEY');const secret='sk_live_never_export_this';`,'page.tsx');
 assert.deepEqual(r.routes,['/calendar']);assert.deepEqual(r.functionCalls,['generate-caption']);assert.deepEqual(r.environmentNames,['REPLICATE_API_KEY']);assert.ok(!JSON.stringify(r).includes('sk_live_'));
});
test('finds executable Lovable dependencies without treating comments as runtime',()=>{
 const r=scanSource(`// old https://ai.gateway.lovable.dev/v1/chat/completions\nconst url='https://ai.gateway.lovable.dev/v1/chat/completions';Deno.env.get('LOVABLE_API_KEY');`,'handler.ts');
 assert.deepEqual(r.legacyDependencies,['lovable_provider_key','lovable_runtime_endpoint']);
 assert.deepEqual(scanSource('// LOVABLE_API_KEY https://ai.gateway.lovable.dev/v1','comment.ts').legacyDependencies,[]);
});
test('fails a new legacy endpoint category even in an existing legacy-dependent file',()=>{
 const baseline={schemaVersion:1,legacyDependencies:[{path:'a.ts',categories:['lovable_provider_key']}]};
 assert.deepEqual(newLegacyDependencies({legacyDependencies:[{path:'a.ts',categories:['lovable_provider_key']}]},baseline),[]);
 assert.equal(newLegacyDependencies({legacyDependencies:[{path:'a.ts',categories:['lovable_runtime_endpoint']}]},baseline).length,1);
 assert.equal(newLegacyDependencies({legacyDependencies:[{path:'new.ts',categories:['lovable_provider_key']}]},baseline).length,1);
});
test('allows removal of legacy dependencies',()=>{
 assert.deepEqual(newLegacyDependencies({legacyDependencies:[]},{schemaVersion:1,legacyDependencies:[{path:'old.ts',categories:['lovable_runtime_endpoint']}]}),[]);
});

test('finds connector endpoints, template heads and platform credential variants',()=>{
 const r=scanSource('const url = `https://connector-gateway.lovable.dev/${path}`;Deno.env.get("LOVABLE_CONNECTOR_API_KEY");','connector.ts');
 assert.deepEqual(r.legacyDependencies,['lovable_provider_key','lovable_runtime_endpoint']);
});
test('does not confuse a different domain with a platform endpoint',()=>{
 assert.deepEqual(scanSource('const url="https://lovable.dev.example.invalid/path";','other.ts').legacyDependencies,[]);
});
