#!/usr/bin/env node
/**
 * Detect (and repair) any compaction event whose shadowed span contains a
 * `system/message` seq — the exact condition the v4 format validator rejects as
 * "compaction cannot shadow the protected system head".
 *
 * Memory-lean: frames are scanned one at a time; only the system seq set and the
 * compaction events' own seq arrays are retained (~a few MB for a 25 MB log).
 *
 * Usage:
 *   node repair-session3.mjs --check  <file>
 *   node repair-session3.mjs --repair <file>
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

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

function scan(buf) {
  const systemSeqs = new Set();
  const carriers = [];
  let events = 0; let maxSeq = 0; let frameIndex = 0;
  for (const [start, end] of frameRanges(buf)) {
    const text = zlib.zstdDecompressSync(buf.subarray(start, end)).toString('utf8');
    for (const line of text.split('\n')) {
      if (!line) continue;
      events += 1;
      if (!line.includes('"system/message"') && !line.includes('shadowedSeqs')) continue;
      let parsed;
      try { parsed = JSON.parse(line); } catch { continue; }
      if (typeof parsed.seq === 'number' && parsed.seq > maxSeq) maxSeq = parsed.seq;
      if (parsed.type === 'system/message') { systemSeqs.add(parsed.seq); continue; }
      const seqs = parsed.data?.shadowedSeqs;
      if (!Array.isArray(seqs) || seqs.length === 0) continue;
      carriers.push({ type: parsed.type, seq: parsed.seq, seqs, frame: frameIndex });
    }
    frameIndex += 1;
  }
  // second walk: we only know all system seqs after the first pass over frames,
  // so collection above keeps carriers; classify now.
  return { systemSeqs, carriers, events, maxSeq, frames: frameIndex };
}

const [, , modeArg, file] = process.argv;
if (!modeArg || !file) { console.error('usage: repair-session3.mjs --check|--repair <file>'); process.exit(2); }

const buf = fs.readFileSync(file);
const s = scan(buf);
const offenders = s.carriers.filter((c) => c.seqs.some((q) => s.systemSeqs.has(q)));
console.log(`frames=${s.frames} events=${s.events} maxSeq=${s.maxSeq}`);
console.log(`system/message=${s.systemSeqs.size} 携带 shadowedSeqs 的事件=${s.carriers.length}`);
console.log(`违规=${offenders.length}`);
for (const o of offenders.slice(0, 12)) {
  const hit = o.seqs.filter((q) => s.systemSeqs.has(q));
  console.log(`  seq=${o.seq} ${o.type} frame=${o.frame} 命中 system=${JSON.stringify(hit)} 位置=${o.seqs.findIndex((q) => s.systemSeqs.has(q))}/${o.seqs.length}`);
}
if (offenders.length === 0) { console.log('OK: 无违规'); process.exit(0); }
if (modeArg === '--check') process.exit(1);

const patchSeqs = new Set(offenders.map((o) => o.seq));
const patchFrames = new Set(offenders.map((o) => o.frame));
const out = []; let frameIndex = 0; let patchedRows = 0; const log = [];
for (const [start, end] of frameRanges(buf)) {
  const raw = buf.subarray(start, end);
  if (!patchFrames.has(frameIndex)) { out.push(raw); frameIndex += 1; continue; }
  const text = zlib.zstdDecompressSync(raw).toString('utf8');
  const lines = text.split('\n');
  for (let j = 0; j < lines.length; j += 1) {
    const line = lines[j];
    if (!line || !line.includes('shadowedSeqs')) continue;
    let parsed;
    try { parsed = JSON.parse(line); } catch { continue; }
    if (!patchSeqs.has(parsed.seq)) continue;
    const seqs = parsed.data?.shadowedSeqs;
    if (!Array.isArray(seqs)) continue;
    const idx = seqs.findIndex((q) => s.systemSeqs.has(q));
    if (idx < 0) continue;
    if (idx === 0) {
      // Head sits at the start: drop it and slide the start forward one node.
      parsed.data.shadowedSeqs = seqs.slice(1);
      parsed.data.shadowedRange = { start: seqs[1], end: parsed.data.shadowedRange.end };
      log.push(`PATCH(trim-start) seq=${parsed.seq}: 丢弃 ${seqs[0]}，range ${seqs[1]}..${parsed.data.shadowedRange.end}`);
    } else {
      // Head sits mid-span: a contiguous slice cannot skip it, so stop the span
      // just before it. The untouched tail simply stays visible.
      parsed.data.shadowedSeqs = seqs.slice(0, idx);
      parsed.data.shadowedRange = { start: seqs[0], end: seqs[idx - 1] };
      log.push(`PATCH(truncate) seq=${parsed.seq}: 在 ${seqs[idx]} 前截断，range ${seqs[0]}..${seqs[idx - 1]} (${idx} 项)`);
    }
    lines[j] = JSON.stringify(parsed);
    patchedRows += 1;
  }
  out.push(zlib.zstdCompressSync(Buffer.from(lines.join('\n'), 'utf8')));
  frameIndex += 1;
}
const repaired = Buffer.concat(out);
const a = scan(repaired);
const still = a.carriers.filter((c) => c.seqs.some((q) => a.systemSeqs.has(q)));
console.log(log.join('\n'));
console.log(`重写帧=${patchFrames.size} 补丁行=${patchedRows}`);
console.log(`复扫 events=${a.events}(原 ${s.events}) maxSeq=${a.maxSeq} 违规=${still.length}`);
for (const x of still.slice(0, 5)) console.log(`  REMAIN seq=${x.seq} ${x.type}`);
if (still.length !== 0 || a.events !== s.events) { console.error('复扫未通过，原文件未改动'); process.exit(4); }

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
const backup = `${file}.corrupt-backup-${stamp}`;
fs.copyFileSync(file, backup);
fs.writeFileSync(file, repaired);
console.log(`backup=${backup}`);
console.log(`size ${buf.length} -> ${repaired.length}`);
console.log('DONE');