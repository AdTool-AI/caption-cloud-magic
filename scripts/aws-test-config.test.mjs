import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAwsTestConfig} from './aws-test-config.mjs';
const token = (role='anon', exp=2000000000) => Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({role,exp})).toString('base64url')+'.c2ln';
const env = (url='https://api-prod.useadtool.ai',key=token()) => ({VITE_AWS_TEST_SUPABASE_URL:url,VITE_AWS_TEST_SUPABASE_ANON_KEY:key});
test('dedicated AWS settings are normalized and never take legacy fallback',()=>{
 assert.equal(resolveAwsTestConfig(env()).url,'https://api-prod.useadtool.ai');
 assert.match(resolveAwsTestConfig(env()).storageKey,/aws-test/);
 assert.throws(()=>resolveAwsTestConfig({VITE_SUPABASE_URL:'https://legacy.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:token()}));
});
test('backend address rejects local, legacy, placeholder and path-bearing origins',()=>{
 for (const url of ['http://api-prod.useadtool.ai','https://api-test.useadtool.ai','https://api-stage.useadtool.ai','https://localhost','https://127.0.0.1','https://192.168.1.1',
  'https://172.16.0.1','https://[::1]','https://legacy.supabase.co','https://useadtool.lovable.app',
  'https://replace-api.useadtool.ai','https://api.example.com','https://api.invalid',
  'https://api-prod.useadtool.ai/rest/v1','https://user:pass@api-prod.useadtool.ai','https://api-prod.useadtool.ai/?key=x'])
  assert.throws(()=>resolveAwsTestConfig(env(url)),url);
});
test('only a future public anon JWT may enter the browser build',()=>{
 for(const key of [token('service_role'),token('authenticated'),token('anon',1),'sb_secret_private','not-a-token'])
  assert.throws(()=>resolveAwsTestConfig(env(undefined,key)));
});
