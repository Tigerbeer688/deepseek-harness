#!/usr/bin/env node
/**
 * Normalizes harvested unified diffs into per-package pnpm-style patches.
 *
 * Reads the raw `git diff --no-index` output (which quotes absolute Windows
 * paths in its headers) plus its `index.json` manifest, rewrites every header
 * to package-relative `a/<file>` / `b/<file>`, and concatenates per-file diffs
 * under one `<package>@<version>.patch` file.
 *
 * @param {string} [diffsDir] directory produced by the profile-web harvest step
 * @returns {string[]} paths of the patch files written
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const diffsDir = process.argv[2]
  ?? 'C:/Users/Administrator/AppData/Local/Temp/2/opencode/patch-harvest/diffs'

/** Extra entries whose diff file is not listed in index.json (github deps). */
const extra = [
  {
    id: 'dsh-quality-review@0.1.0',
    rel: 'lib/index.js',
    diff: 'dsh-quality-review__0.1.0__lib__index.js.diff',
  },
]

/**
 * Rewrites `git diff --git`/`---`/`+++` header lines to package-relative
 * `a/<rel>` / `b/<rel>` paths, handling both quoted and bare forms.
 *
 * @param {string} raw unified diff text
 * @param {string} rel package-relative file path
 * @returns {string}
 */
function normalizeHeaders(raw, rel) {
  const lines = raw.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('diff --git ')) {
      lines[i] = `diff --git a/${rel} b/${rel}`
    } else if (line.startsWith('--- ')) {
      lines[i] = `--- a/${rel}`
    } else if (line.startsWith('+++ ')) {
      lines[i] = `+++ b/${rel}`
    } else if (line.startsWith('rename from ') || line.startsWith('rename to ')) {
      lines[i] = line.startsWith('rename from')
        ? `rename from ${rel}`
        : `rename to ${rel}`
    }
  }
  return lines.join('\n')
}

/**
 * Maps a package id to its pnpm `patchedDependencies` file name:
 * `@scope/name@1.2.3` -> `@scope__name@1.2.3`, `name@1.2.3` unchanged.
 *
 * @param {string} id package id with version suffix
 * @returns {string}
 */
function patchFileName(id) {
  return `${id.replace(/\//g, '__')}.patch`
}

const index = JSON.parse(fs.readFileSync(path.join(diffsDir, 'index.json'), 'utf8'))
const entries = [...index, ...extra].filter((e) => e.diff)

/** @type {Map<string, string[]>} package id -> normalized diff bodies */
const byPackage = new Map()
const written = []

for (const entry of entries) {
  const raw = fs
    .readFileSync(path.join(diffsDir, entry.diff), 'utf8')
    .replace(/^\uFEFF/, '')
  if (!raw.startsWith('diff --git')) {
    throw new Error(`unexpected diff format: ${entry.diff}`)
  }
  const body = normalizeHeaders(raw, entry.rel)
  if (body.includes('C:\\') || body.includes('C:/')) {
    throw new Error(`absolute path survived normalization: ${entry.diff}`)
  }
  const list = byPackage.get(entry.id) ?? []
  list.push(body.replace(/\n*$/, '\n'))
  byPackage.set(entry.id, list)
}

for (const [id, bodies] of byPackage) {
  const file = patchFileName(id)
  const target = path.join(here, file)
  fs.writeFileSync(target, bodies.join(''))
  written.push(target)
  console.log('WROTE', path.relative(process.cwd(), target))
}

fs.writeFileSync(
  path.join(here, 'manifest.json'),
  JSON.stringify(
    [...byPackage.keys()].sort().map((id) => ({ id })),
    null,
    2,
  ) + '\n',
)
written.push(path.join(here, 'manifest.json'))
console.log('DONE', written.length)
