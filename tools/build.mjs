import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const { id, name } = pkg.appSystemizer;
// The version is plain SemVer 2.0.0 and is maintained only in package.json.
const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(pkg.version);
if (!match) {
  throw new Error(`package.json version must be MAJOR.MINOR.PATCH without a prefix, got ${pkg.version}`);
}
const [major, minor, patch] = match.slice(1).map(Number);
if (minor > 999 || patch > 999) {
  throw new Error('MINOR and PATCH must each stay below 1000 so versionCode keeps the same shape');
}
// Installers compare this integer and nothing else, so it is derived from the
// version alone: three decimal digits per component, e.g. 1.3.2 -> 1003002.
// Ordering therefore always matches the version.
const versionCode = major * 1_000_000 + minor * 1_000 + patch;
if (versionCode > 2_147_483_647) throw new Error('versionCode exceeds the signed 32-bit range');
const version = pkg.version;
const metadata = { id, name, version, versionCode };
const propPath = resolve(root, 'module/module.prop');
let prop = readFileSync(propPath, 'utf8').replace(/\r\n/g, '\n');
for (const [key, value] of Object.entries(metadata)) {
  prop = prop.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`);
}
writeFileSync(propPath, prop);
writeFileSync(resolve(root, 'module/webroot/module-info.json'), `${JSON.stringify(metadata, null, 2)}\n`);
await build({
  absWorkingDir: root,
  entryPoints: ['module/webroot/app.js'],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  outfile: 'module/webroot/bundle.js',
});
console.log(`Built ${name} ${version} (versionCode ${versionCode})`);
