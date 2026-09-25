#!/usr/bin/env node
/**
 * Applies the archived profile-web node_modules patches to a DSH profile.
 *
 * Re-run after every `pnpm install` in the profile: the install restores
 * pristine package files and discards every patch below. Each patch is
 * package-relative, so it is applied with `git apply -p1` from the package
 * root inside the profile's `node_modules`. Already-applied patches are
 * detected via a reverse check and reported instead of failing.
 *
 * Usage:
 *   node apply.mjs [--profile <root>] [--check] [--shims]
 *
 * `--profile` defaults to the local web profile. `--check` only reports
 * readiness without writing. `--shims` additionally restores the file: shim
 * packages from `shims/`.
 *
 * Exit code 0 means every patch was applied, already applied, or ready.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)

/** @param {string} name @returns {boolean} */
function flag(name) {
  return argv.includes(name)
}

/**
 * @param {string} name
 * @param {string} fallback
 * @returns {string}
 */
function opt(name, fallback) {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}

const profile = path.resolve(opt('--profile', 'C:/Users/Administrator/.dsh/profiles/web'))
const checkOnly = flag('--check')
const withShims = flag('--shims')
const nmRoot = path.join(profile, 'node_modules')

/**
 * Maps a package id to its pnpm-style patch file name.
 *
 * @param {string} id package id with version suffix
 * @returns {string}
 */
function patchFileName(id) {
  return `${id.replace(/\//g, '__')}.patch`
}

/**
 * Resolves the installed package directory for an id such as
 * `@scope/name@1.2.3`.
 *
 * @param {string} id package id with version suffix
 * @returns {string} absolute path to the package root in node_modules
 */
function packageDir(id) {
  const name = id.slice(0, id.lastIndexOf('@'))
  return path.join(nmRoot, ...name.split('/'))
}

/**
 * Runs `git apply` with the given args from a package directory.
 *
 * `core.autocrlf=false` keeps results byte-identical to pnpm's LF extracts
 * regardless of the host Git config.
 *
 * @param {string} dir cwd for git apply
 * @param {string[]} args git apply arguments
 * @returns {{ ok: boolean, out: string }}
 */
function gitApply(dir, args) {
  const res = spawnSync('git', ['-c', 'core.autocrlf=false', 'apply', ...args], {
    cwd: dir,
    encoding: 'utf8',
  })
  return { ok: res.status === 0, out: `${res.stdout ?? ''}${res.stderr ?? ''}` }
}

/** @type {{ id: string }[]} */
const manifest = JSON.parse(fs.readFileSync(path.join(here, 'manifest.json'), 'utf8'))

let failures = 0
for (const { id } of manifest) {
  const dir = packageDir(id)
  const patchPath = path.join(here, patchFileName(id))
  if (!fs.existsSync(patchPath)) {
    console.error('NO_PATCH_FILE', id)
    failures += 1
    continue
  }
  if (!fs.existsSync(dir)) {
    console.error('MISSING_PACKAGE', id, dir)
    failures += 1
    continue
  }
  const check = gitApply(dir, ['--check', '-p1', patchPath])
  if (check.ok) {
    if (checkOnly) {
      console.log('READY', id)
      continue
    }
    const apply = gitApply(dir, ['-p1', '--whitespace=nowarn', patchPath])
    if (apply.ok) {
      console.log('APPLIED', id)
      continue
    }
    console.error('APPLY_FAILED', id, apply.out.trim())
    failures += 1
    continue
  }
  const reverse = gitApply(dir, ['--check', '-R', '-p1', patchPath])
  if (reverse.ok) {
    console.log('ALREADY', id)
    continue
  }
  console.error('PATCH_DOES_NOT_APPLY', id, check.out.trim())
  failures += 1
}

if (withShims) {
  const shims = path.join(here, 'shims')
  for (const entry of fs.readdirSync(shims, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const src = path.join(shims, entry.name)
    const pkg = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8'))
    const destDir = path.join(nmRoot, ...pkg.name.split('/'))
    if (checkOnly) {
      console.log(fs.existsSync(destDir) ? 'SHIM_PRESENT' : 'SHIM_MISSING', pkg.name)
      continue
    }
    fs.cpSync(src, destDir, { recursive: true })
    console.log('SHIM_COPIED', pkg.name)
  }
}

if (failures > 0) {
  console.error('FAILURES', failures)
  process.exit(1)
}
console.log('OK')
