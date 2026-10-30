import { readFileSync, lstatSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function verifyAwsProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile) ||
      Object.keys(profile).sort().join(',') !== 'backendOrigin,publicCutover,scope,target' ||
      profile.target !== 'aws-test' || profile.backendOrigin !== 'https://api-prod.useadtool.ai' ||
      profile.scope !== 'bootstrap-read-validation' || profile.publicCutover !== false) {
    throw new Error('Artifact is not the approved AWS bootstrap validation profile.');
  }
  return profile;
}
export function verifyProfileFile(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32768) throw new Error('Backend profile must be a small regular JSON file.');
  return verifyAwsProfile(JSON.parse(readFileSync(path, 'utf8')));
}
export function verifyBuildDirectory(path) {
  const index = lstatSync(join(path, 'index.html'));
  if (!index.isFile() || index.isSymbolicLink() || !index.size) throw new Error('AWS build is missing index.html.');
  return verifyProfileFile(join(path, 'backend-profile.json'));
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [mode, path, ...extra] = process.argv.slice(2);
    if (!path || extra.length || !['--dir', '--profile'].includes(mode)) throw new Error('Use --dir <artifact-directory> or --profile <downloaded-profile.json>.');
    const profile = mode === '--dir' ? verifyBuildDirectory(path) : verifyProfileFile(path);
    console.log(`Verified AWS bootstrap frontend: ${profile.backendOrigin}`);
  } catch {
    console.error('AWS artifact verification failed: expected api-prod bootstrap profile and a valid build artifact.');
    process.exitCode = 1;
  }
}
