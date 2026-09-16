import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const { id, name, timeZone } = pkg.appSystemizer;
const dateParts = new Intl.DateTimeFormat('en-US', {
  timeZone, year: '2-digit', month: '2-digit', day: '2-digit',
}).formatToParts(new Date());
const date = Object.fromEntries(dateParts.map(({ type, value }) => [type, value]));
const versionCode = `${date.year}${date.month}${date.day}`;
const version = `${pkg.version}(${versionCode})`;
const metadata = { id, name, version, versionCode: Number(versionCode) };
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
