/**
 * Podržan je samo FlateDecode tok čiji je tekst u nizovima `(...)` unutar
 * operatora TJ. Inflate ide preko Web DecompressionStream (zlib/RFC 1950).
 * Nema `node:zlib`, nema opšteg PDF motora, nema spoljnog procesa i nema LZW.
 */

const STRING = /\((?:\\.|[^\\)])*\)/g;

export async function extractPdfTextLines(bytes: Uint8Array): Promise<string[]> {
  const lines: string[] = [];
  let cursor = 0;
  while (cursor < bytes.length) {
    const filterAt = indexOfAscii(bytes, '/FlateDecode', cursor);
    if (filterAt < 0) break;
    const streamAt = indexOfAscii(bytes, 'stream', filterAt);
    if (streamAt < 0) break;
    let dataAt = streamAt + 'stream'.length;
    if (bytes[dataAt] === 0x0d && bytes[dataAt + 1] === 0x0a) dataAt += 2;
    else if (bytes[dataAt] === 0x0a) dataAt += 1;
    const endAt = indexOfAscii(bytes, 'endstream', dataAt);
    if (endAt < 0) break;
    try {
      const inflated = await inflateZlib(bytes.subarray(dataAt, endAt));
      lines.push(...tjLines(latin1(inflated)));
    } catch {
      // Oštećen tok se preskače. Ostali tokovi i dalje mogu dati redove.
    }
    cursor = endAt + 'endstream'.length;
  }
  return lines;
}

async function inflateZlib(bytes: Uint8Array): Promise<Uint8Array> {
  const stripped = stripTrailingNewline(bytes);
  try {
    return await inflateOnce(stripped);
  } catch (error) {
    if (stripped.length === bytes.length) throw error;
    return inflateOnce(bytes);
  }
}

function stripTrailingNewline(bytes: Uint8Array): Uint8Array {
  let end = bytes.length;
  if (end > 0 && bytes[end - 1] === 0x0a) end -= 1;
  if (end > 0 && bytes[end - 1] === 0x0d) end -= 1;
  return bytes.subarray(0, end);
}

async function inflateOnce(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function latin1(bytes: Uint8Array): string {
  let out = '';
  const size = 0x4000;
  for (let index = 0; index < bytes.length; index += size) {
    const chunk = bytes.subarray(index, index + size);
    out += String.fromCharCode(...chunk);
  }
  return out;
}

function indexOfAscii(bytes: Uint8Array, needle: string, from: number): number {
  const pattern = new TextEncoder().encode(needle);
  if (pattern.length === 0 || from > bytes.length - pattern.length) return -1;
  for (let index = Math.max(0, from); index <= bytes.length - pattern.length; index += 1) {
    let matched = true;
    for (let offset = 0; offset < pattern.length; offset += 1) {
      if (bytes[index + offset] !== pattern[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return index;
  }
  return -1;
}

function tjLines(content: string): string[] {
  const lines: string[] = [];
  const marker = ' TJ';
  let cursor = 0;
  while (cursor < content.length) {
    const at = content.indexOf(marker, cursor);
    if (at < 0) break;
    const start = content.lastIndexOf('[', at);
    if (start < 0 || start < cursor - 1) {
      cursor = at + marker.length;
      continue;
    }
    const text = decodeStrings(content.slice(start, at));
    if (text) lines.push(text);
    cursor = at + marker.length;
  }
  return lines;
}

function decodeStrings(chunk: string): string {
  let text = '';
  for (const match of chunk.matchAll(STRING)) {
    text += decodePdfLiteral(match[0].slice(1, -1));
  }
  return text.trim();
}

function decodePdfLiteral(value: string): string {
  let out = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== '\\') {
      out += char;
      continue;
    }
    const next = value[index + 1];
    if (next === undefined) break;
    if (next === 'n') out += '\n';
    else if (next === 'r') out += '\r';
    else if (next === 't') out += '\t';
    else if (next === '(' || next === ')' || next === '\\') out += next;
    else out += next;
    index += 1;
  }
  return out;
}
