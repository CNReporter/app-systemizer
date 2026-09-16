import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'module');
const dist = resolve(root, 'dist');
const prop = readFileSync(resolve(source, 'module.prop'), 'utf8');
const id = prop.match(/^id=(.+)$/m)[1].trim();
const version = prop.match(/^version=(.+)$/m)[1].trim();
const staging = resolve(dist, id);
const archive = resolve(dist, `App-Systemizer-KSU-v${version}.zip`);
rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
for (const name of readdirSync(source)) cpSync(resolve(source, name), resolve(staging, name), { recursive: true });
if (existsSync(archive)) rmSync(archive);
// Do not archive `.` here: that produces `./module.prop`, while KernelSU's
// installer expects module.prop and customize.sh at the ZIP root exactly.
execFileSync('tar', ['-a', '-c', '-f', archive, '-C', staging, ...readdirSync(staging)], { stdio: 'inherit' });
console.log(`Created ${archive}`);
