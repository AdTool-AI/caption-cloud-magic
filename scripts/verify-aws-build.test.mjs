import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { verifyAwsProfile, verifyBuildDirectory, verifyProfileFile } from './verify-aws-build.mjs';
const valid = {target:'aws-test',backendOrigin:'https://api-prod.useadtool.ai',scope:'application-read-preview',publicCutover:false};
function cleanup(root,prefix) {
  const target=resolve(root);
  assert.equal(dirname(target),resolve(tmpdir()));
  assert.ok(basename(target).startsWith(prefix));
  rmSync(target,{recursive:true,force:true});
}
test('accepts only the selected AWS origin and explicit validation scope',()=>{
  assert.deepEqual(verifyAwsProfile(valid),valid);
  for(const value of [null,[],{...valid,target:'legacy'},{...valid,backendOrigin:'https://old.supabase.co'},
    {...valid,scope:'accepted-first-party-features'},{...valid,publicCutover:true},{...valid,publicCutover:'false'},
    {...valid,anonKey:'must-not-be-in-marker'}]) assert.throws(()=>verifyAwsProfile(value));
});
test('validates a fresh artifact and rejects missing index or wrong metadata',()=>{
  const root=mkdtempSync(join(tmpdir(),'adtool-artifact-'));
  try {
    writeFileSync(join(root,'backend-profile.json'),JSON.stringify(valid));
    assert.throws(()=>verifyBuildDirectory(root));
    writeFileSync(join(root,'index.html'),'<!doctype html><div id="root"></div>');
    assert.deepEqual(verifyBuildDirectory(root),valid);
    writeFileSync(join(root,'backend-profile.json'),JSON.stringify({...valid,target:'legacy'}));
    assert.throws(()=>verifyBuildDirectory(root));
  } finally {cleanup(root,'adtool-artifact-');}
});
test('rejects HTML SPA fallbacks and oversized remote markers',()=>{
  const root=mkdtempSync(join(tmpdir(),'adtool-profile-'));const file=join(root,'response.json');
  try {
    writeFileSync(file,'<!doctype html><html>old deployment</html>');assert.throws(()=>verifyProfileFile(file));
    writeFileSync(file,' '.repeat(32769));assert.throws(()=>verifyProfileFile(file));
  } finally {cleanup(root,'adtool-profile-');}
});
