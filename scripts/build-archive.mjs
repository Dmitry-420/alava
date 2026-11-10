import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const INCLUDE_DIRS = ['src', 'public', 'scripts'];
const INCLUDE_FILES = [
  'package.json',
  'astro.config.mjs',
  'tsconfig.json',
  'specs.md',
  'bun.lock',
  '.gitignore',
];
const EXCLUDE = new Set([
  'node_modules',
  '.git',
  'out',
  'dist',
  '.astro',
  'pronine-alava-project.zip',
  'project-code.txt',
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDE.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function collect() {
  const files = [];
  for (const dir of INCLUDE_DIRS) {
    const abs = join(ROOT, dir);
    try {
      for (const file of walk(abs)) files.push(file);
    } catch {
      /* каталога нет — пропускаем */
    }
  }
  for (const file of INCLUDE_FILES) {
    const abs = join(ROOT, file);
    try {
      readFileSync(abs);
      files.push(abs);
    } catch {
      /* файла нет — пропускаем */
    }
  }
  return files
    .map((abs) => ({
      name: 'pronine-alava/' + relative(ROOT, abs).split(sep).join('/'),
      data: readFileSync(abs),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function buildZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const { time, day } = dosDateTime(new Date());

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = entry.data;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(day, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);

    offset += local.length + name.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, centralBuf, end]);
}

function buildText(entries) {
  const parts = [
    "PRONINE Alava 11'6\" — полный код проекта (Astro + Tailwind v4)",
    `Файлов: ${entries.length}`,
    '',
  ];
  for (const entry of entries) {
    parts.push('='.repeat(72));
    parts.push(`FILE: ${entry.name}`);
    parts.push('='.repeat(72));
    parts.push(entry.data.toString('utf8').replace(/\s+$/, ''));
    parts.push('');
  }
  return Buffer.from(parts.join('\n'), 'utf8');
}

export function makeArchive() {
  const entries = collect();
  return {
    zip: buildZip(entries),
    txt: buildText(entries),
    count: entries.length,
  };
}
