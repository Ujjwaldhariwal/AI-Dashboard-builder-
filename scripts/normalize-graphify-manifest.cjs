/* eslint-disable @typescript-eslint/no-require-imports */
const { readFileSync, writeFileSync } = require('node:fs')
const { isAbsolute, relative, resolve, sep } = require('node:path')

const workspaceRoot = resolve(process.cwd())
const manifestPath = resolve(workspaceRoot, '.graphify', 'manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

function portablePath(filePath) {
  const absolutePath = isAbsolute(filePath) ? resolve(filePath) : resolve(workspaceRoot, filePath)
  const repoRelative = relative(workspaceRoot, absolutePath)
  if (
    repoRelative === ''
    || repoRelative === '..'
    || repoRelative.startsWith(`..${sep}`)
    || isAbsolute(repoRelative)
  ) {
    throw new Error(`Refusing to normalize a manifest path outside the workspace: ${filePath}`)
  }
  return repoRelative.split(sep).join('/')
}

const portableManifest = Object.fromEntries(
  Object.entries(manifest)
    .map(([filePath, metadata]) => [portablePath(filePath), metadata])
    .sort(([left], [right]) => left.localeCompare(right)),
)

writeFileSync(manifestPath, `${JSON.stringify(portableManifest, null, 2)}\n`, 'utf8')
console.log(`Normalized ${Object.keys(portableManifest).length} Graphify manifest paths.`)
