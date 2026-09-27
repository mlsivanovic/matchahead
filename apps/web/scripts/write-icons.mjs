import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons');

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function onMark(nx, ny) {
  const left = nx >= 0.18 && nx <= 0.32 && ny >= 0.22 && ny <= 0.78;
  const right = nx >= 0.68 && nx <= 0.82 && ny >= 0.22 && ny <= 0.78;
  const diagonal = ny >= 0.22 && ny <= 0.66
    && nx > 0.28 && nx < 0.72
    && Math.abs(ny - (0.22 + Math.abs(nx - 0.5) * 1.2)) < 0.075;
  return left || right || diagonal;
}

function png(size, insetRatio) {
  const rows = [];
  const inset = Math.floor(size * insetRatio);
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x += 1) {
      const inner = size - inset * 2;
      const nx = (x - inset) / inner;
      const ny = (y - inset) / inner;
      const mark = nx >= 0 && ny >= 0 && nx <= 1 && ny <= 1 && onMark(nx, ny);
      const offset = 1 + x * 3;
      if (mark) {
        row[offset] = 226;
        row[offset + 1] = 177;
        row[offset + 2] = 90;
      } else {
        row[offset] = 16;
        row[offset + 1] = 33;
        row[offset + 2] = 27;
      }
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(root, { recursive: true });
writeFileSync(resolve(root, 'icon-192.png'), png(192, 0));
writeFileSync(resolve(root, 'icon-512.png'), png(512, 0));
writeFileSync(resolve(root, 'icon-maskable-512.png'), png(512, 0.18));
