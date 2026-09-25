import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const tmpRoot = 'C:/Users/ADMINI~1/AppData/Local/Temp/2/opencode/patch-harvest'
const profileNm = 'C:/Users/Administrator/.dsh/profiles/web/node_modules'
const outDir = 'C:/Users/ADMINI~1/AppData/Local/Temp/2/opencode/patch-harvest/diffs'

fs.mkdirSync(tmpRoot, { recursive: true })
fs.mkdirSync(outDir, { recursive: true })

/** npm packages: name@version -> list of relative files to diff */
const npmPkgs = [
  { id: '@opencode2dsh/dsh-plugin@0.3.3', files: ['lib/index.js', 'lib/catalog-4gwZT9We.js'] },
  { id: '@earendil-works/pi-ai@0.82.1', files: ['dist/api/openai-completions.js'] },
  { id: 'dsh-free-search@0.4.35', files: ['lib/index.js', 'lib/client.js'] },
  { id: 'dsh-gungnir@0.2.1', files: ['dist/index.js', 'dist/surfaces.js'] },
  { id: 'dsh-loop-continue@0.2.0', files: ['lib/index.js'] },
  { id: 'dsh-answer-reviewer@0.7.2', files: ['lib/review.js'] },
  { id: 'dsh-soul@0.5.0', files: ['index.mjs'] },
  { id: 'dsh-engram@0.4.0', files: ['lib/context-gc.js'] },
]

const results = []

function safeSh(cmd) {
  return execSync(cmd, { cwd: tmpRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

for (const pkg of npmPkgs) {
  const slug = pkg.id.replace(/[/@]/g, '__')
  const work = path.join(tmpRoot, slug)
  fs.rmSync(work, { recursive: true, force: true })
  fs.mkdirSync(work, { recursive: true })
  console.log('PACK', pkg.id)
  let tgz
  try {
    const out = safeSh(`npm pack "${pkg.id}"`)
    tgz = out.trim().split(/\r?\n/).filter(Boolean).pop()
  } catch (e) {
    console.error('PACK_FAIL', pkg.id, e.message)
    results.push({ id: pkg.id, error: String(e.message).slice(0, 200) })
    continue
  }
  const tgzPath = path.join(tmpRoot, tgz)
  safeSh(`tar -xzf "${tgz}" -C "${work}"`)
  const pristineRoot = path.join(work, 'package')
  for (const rel of pkg.files) {
    const pristine = path.join(pristineRoot, rel)
    const installed = path.join(profileNm, pkg.id.split('@')[0].startsWith('@')
      ? pkg.id.slice(0, pkg.id.lastIndexOf('@')).replace('/', path.sep)
      : pkg.id.split('@')[0], rel)
    // fix installed path: scoped packages
    let instPath
    if (pkg.id.startsWith('@')) {
      const at = pkg.id.lastIndexOf('@')
      const scopeName = pkg.id.slice(0, at) // @scope/name
      instPath = path.join(profileNm, scopeName, rel)
    } else {
      instPath = path.join(profileNm, pkg.id.split('@')[0], rel)
    }
    if (!fs.existsSync(pristine)) {
      console.error('NO_PRISTINE', pkg.id, rel)
      continue
    }
    if (!fs.existsSync(instPath)) {
      console.error('NO_INSTALLED', instPath)
      continue
    }
    const a = fs.readFileSync(pristine)
    const b = fs.readFileSync(instPath)
    if (a.equals(b)) {
      console.log('SAME', pkg.id, rel)
      results.push({ id: pkg.id, rel, same: true })
      continue
    }
    const diffName = `${slug}__${rel.replace(/[\\/]/g, '__')}.diff`
    const diffPath = path.join(outDir, diffName)
    // use git diff --no-index for unified diff
    try {
      safeSh(`git diff --no-index --binary -- "${pristine}" "${instPath}"`)
    } catch {}
    // git diff returns exit 1 when differences; capture output
    let diffText = ''
    try {
      diffText = execSync(`git diff --no-index --binary -- "${pristine}" "${instPath}"`, {
        cwd: tmpRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
      })
    } catch (e) {
      diffText = e.stdout || ''
    }
    // rewrite paths to package-relative a/ b/
    diffText = diffText
      .replaceAll(pristine.replaceAll('\\', '/'), `a/${rel}`)
      .replaceAll(instPath.replaceAll('\\', '/'), `b/${rel}`)
      .replaceAll(pristine, `a/${rel}`)
      .replaceAll(instPath, `b/${rel}`)
    fs.writeFileSync(diffPath, diffText)
    const lines = diffText.split(/\r?\n/).length
    console.log('DIFF', pkg.id, rel, 'lines=', lines)
    results.push({ id: pkg.id, rel, diff: diffName, lines })
  }
}

fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(results, null, 2))
console.log('DONE', results.length)
