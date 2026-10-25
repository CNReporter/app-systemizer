import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

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

// KernelSU and every other installer expect a real ZIP container. `tar -a`
// only produces one where tar is bsdtar; GNU tar ignores the `.zip` suffix and
// silently writes an uncompressed tar, which the installer rejects. Build the
// container here so the archive does not depend on whichever tar is on PATH.
const CRC_TABLE = new Int32Array(256);
for (let i = 0; i < 256; i += 1) {
  let c = i;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[i] = c;
}
const crc32 = (buffer) => {
  let c = -1;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const dosStamp = (date) => ({
  time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
  date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
});

// Sorted walk keeps the output byte-stable for an unchanged tree.
const entries = [];
const walk = (dir) => {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const entryName = relative(staging, full).split(sep).join('/');
    const stat = statSync(full);
    if (stat.isDirectory()) {
      entries.push({ name: `${entryName}/`, dir: true, mode: 0o755, mtime: stat.mtime });
      walk(full);
    } else {
      // Normalise permissions: the host filesystem may report 0600 for files
      // that the installer still needs to read and execute.
      entries.push({
        name: entryName,
        dir: false,
        mode: name.endsWith('.sh') ? 0o755 : 0o644,
        data: readFileSync(full),
        mtime: stat.mtime,
      });
    }
  }
};
walk(staging);

const parts = [];
const central = [];
let offset = 0;
for (const entry of entries) {
  const name = Buffer.from(entry.name, 'utf8');
  // Do not store `.` prefixed paths: module.prop and customize.sh must sit at
  // the ZIP root exactly where the installer looks for them.
  const raw = entry.dir ? Buffer.alloc(0) : entry.data;
  const body = entry.dir ? raw : deflateRawSync(raw, { level: 9 });
  const method = entry.dir ? 0 : 8;
  const crc = entry.dir ? 0 : crc32(raw);
  const stamp = dosStamp(entry.mtime);
  const external = ((entry.mode << 16) | (entry.dir ? 0x10 : 0)) >>> 0;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(stamp.time, 10);
  local.writeUInt16LE(stamp.date, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  parts.push(local, name, body);

  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(0x031e, 4); // made by Unix, spec 3.0
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(method, 10);
  header.writeUInt16LE(stamp.time, 12);
  header.writeUInt16LE(stamp.date, 14);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(body.length, 20);
  header.writeUInt32LE(raw.length, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(external, 38);
  header.writeUInt32LE(offset, 42);
  central.push(header, name);

  offset += local.length + name.length + body.length;
}

const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(0, 4);
end.writeUInt16LE(0, 6);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(central.reduce((n, buffer) => n + buffer.length, 0), 12);
end.writeUInt32LE(offset, 16);
end.writeUInt16LE(0, 20);

const zip = Buffer.concat([...parts, ...central, end]);
writeFileSync(archive, zip);

// Fail the build here rather than at the install dialog.
if (zip.readUInt32LE(0) !== 0x04034b50) throw new Error('archive does not start with a local file header');
if (!zip.subarray(zip.length - 22).equals(end)) throw new Error('archive is missing its end-of-central-directory record');
console.log(`Created ${archive} (${entries.length} entries, ${(zip.length / 1024).toFixed(1)} KiB)`);
