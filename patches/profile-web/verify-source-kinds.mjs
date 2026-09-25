#!/usr/bin/env node
/**
 * Verifies the profile-web source-kind patches and scans for unpatched
 * legacy `source: { kind: 'plugin' }` literals across the profile.
 *
 * Usage: node verify-source-kinds.mjs [profileRoot]
 *
 * Exit code 0 means every expected patch marker is present and no legacy
 * source literal remains anywhere under the profile's node_modules.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const profile = process.argv[2] ?? 'C:/Users/Administrator/.dsh/profiles/web'
const root = path.join(profile, 'node_modules')
const checks = [
  ['dsh-gungnir/dist/index.js', "kind: 'plugin:gungnir'"],
  ['dsh-gungnir/dist/surfaces.js', "kind: 'plugin:gungnir'"],
  ['dsh-loop-continue/lib/index.js', 'plugin:${name}'],
  ['dsh-answer-reviewer/lib/review.js', 'plugin:${PLUGIN_NAME}'],
  ['dsh-quality-review/lib/index.js', 'plugin:quality-review'],
  ['dsh-soul/index.mjs', 'plugin:dsh-soul'],
  ['dsh-engram/lib/context-gc.js', 'plugin:dsh-engram'],
]

void here

let bad = 0
for (const [rel, needle] of checks) {
  const file = path.join(root, rel)
  if (!fs.existsSync(file)) {
    console.log('MISSING', rel)
    bad += 1
    continue
  }
  const text = fs.readFileSync(file, 'utf8')
  const ok = text.includes(needle)
  console.log(ok ? 'OK' : 'MISS', rel)
  if (!ok) bad += 1
}

/** @param {string} dir @param {string[]} out */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.bin' || entry.name === '.pnpm') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'docs' || entry.name === 'test' || entry.name === 'tests') continue
      walk(full, out)
    } else if (/\.(js|mjs|cjs)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

const oldSource = /source:\s*\{\s*kind:\s*['"]plugin['"]/i
const hits = []
for (const file of walk(root)) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    continue
  }
  if (oldSource.test(text)) hits.push(file)
}
console.log('RUNTIME_OLD_SOURCE_HITS', hits.length)
for (const hit of hits) console.log(' ', hit)
process.exit(bad || hits.length ? 1 : 0)
