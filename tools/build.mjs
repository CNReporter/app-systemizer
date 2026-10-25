import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const { id, name, timeZone } = pkg.appSystemizer;
// The display version is SemVer 2.0.0: the core version lives in package.json,
// and the build date rides along as build metadata (`+<YYYYMMDD>`), which is
// valid SemVer and, by spec, ignored for precedence — the core version alone
// decides whether a release is newer.
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) {
  throw new Error(`package.json version must be a SemVer core version (MAJOR.MINOR.PATCH), got ${pkg.version}`);
}
const dateParts = new Intl.DateTimeFormat('en-US', {
  timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
}).formatToParts(new Date());
const date = Object.fromEntries(dateParts.map(({ type, value }) => [type, value]));
// Version codes historically shipped as six-digit YYMMDD (260916, 261026), so
// upgrades must be compared numerically rather than by digit count. The full
// four-digit year is already larger than every such code and stays well inside
// a signed 32-bit integer. KernelSU and package managers only compare this
// integer, hence it keeps counting days even though the display version is
// semantic.
const versionCode = Number(`${date.year}${date.month}${date.day}`);
const version = `${pkg.version}+${versionCode}`;
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
console.log(`Built ${name} ${version} (${timeZone})`);
