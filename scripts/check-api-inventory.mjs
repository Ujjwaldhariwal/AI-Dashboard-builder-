import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const apiRoots = [
  path.join(root, 'src', 'app', 'api', 'admin'),
  path.join(root, 'src', 'app', 'api', 'client'),
]
const inventoryPath = path.join(root, 'docs', 'apidog-api-inventory.md')
const methodPattern = /export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE)\b/g
const headingPattern = /^### `([A-Z]+) ([^`]+)`$/gm

function walkRoutes(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap(entry => {
    const fullPath = path.join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) return walkRoutes(fullPath)
    return entry === 'route.ts' ? [fullPath] : []
  })
}

function routePathFromFile(filePath) {
  const apiIndex = filePath.split(path.sep).lastIndexOf('api')
  const parts = filePath.split(path.sep).slice(apiIndex + 1, -1)
  return `/api/${parts.map(part => {
    if (part.startsWith('[') && part.endsWith(']')) return `{${part.slice(1, -1)}}`
    return part
  }).join('/')}`
}

function routeMethods(filePath) {
  const source = readFileSync(filePath, 'utf8')
  return Array.from(source.matchAll(methodPattern)).map(match => match[1])
}

const actual = apiRoots
  .flatMap(walkRoutes)
  .flatMap(filePath => routeMethods(filePath).map(method => `${method} ${routePathFromFile(filePath)}`))
  .sort()

const inventory = readFileSync(inventoryPath, 'utf8')
const documented = Array.from(inventory.matchAll(headingPattern))
  .map(match => `${match[1]} ${match[2]}`)
  .sort()

const actualSet = new Set(actual)
const documentedSet = new Set(documented)
const missing = actual.filter(item => !documentedSet.has(item))
const stale = documented.filter(item => !actualSet.has(item))

if (missing.length || stale.length) {
  console.error('API inventory is out of sync.')
  if (missing.length) {
    console.error('\nMissing from docs:')
    missing.forEach(item => console.error(`  - ${item}`))
  }
  if (stale.length) {
    console.error('\nDocumented but no route found:')
    stale.forEach(item => console.error(`  - ${item}`))
  }
  process.exit(1)
}

console.log(`API inventory OK: ${actual.length} route method(s) documented.`)
