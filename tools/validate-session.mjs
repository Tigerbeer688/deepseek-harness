#!/usr/bin/env node
/**
 * Validate one v4 session log with the repository's own format validator.
 * Usage: node validate-session.mjs <session.v4.jsonl.zstd>
 * Exits 0 when the artifact passes, 1 when it fails, 2 on usage error.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

const ROOT = 'C:/study/deepseek-harness';
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

const { assertReleasedV4Relationships } = await import(
  pathToFileURL(`${ROOT}/packages/session/session-format-v3-to-v4/lib/index.js`).href
);

function* frameRanges(buf) {
  let pos = 0; let guard = 0;
  while (pos < buf.length && guard < 500000) {
    guard += 1;
    let candidate = buf.indexOf(MAGIC, pos + 4);
    let done = false;
    while (candidate !== -1) {
      try { zlib.zstdDecompressSync(buf.subarray(pos, candidate)); yield [pos, candidate]; pos = candidate; done = true; break; }
      catch { candidate = buf.indexOf(MAGIC, candidate + 4); }
    }
    if (!done) { yield [pos, buf.length]; break; }
  }
}

const file = process.argv[2];
if (!file) { console.error('usage: validate-session.mjs <file>'); process.exit(2); }

const buf = fs.readFileSync(file);
let header = null;
const events = [];
for (const [start, end] of frameRanges(buf)) {
  const text = zlib.zstdDecompressSync(buf.subarray(start, end)).toString('utf8');
  for (const line of text.split('\n')) {
    if (!line) continue;
    let parsed;
    try { parsed = JSON.parse(line); } catch { continue; }
    if (header === null) { header = parsed; continue; }
    events.push(parsed);
  }
}
const known = new Set(events.map((e) => e.type));
try {
  assertReleasedV4Relationships({ header, events }, known);
  console.log(`VALID  header=${header?.type}/${header?.version} events=${events.length}`);
  process.exit(0);
} catch (error) {
  console.log(`INVALID  ${error.message}`);
  process.exit(1);
}