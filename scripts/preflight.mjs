import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const required = ['lib/index.js', 'client/client.js', 'data/catalog.json', 'cordis.patch.yml', 'LICENSE', 'docs/TESTING.md']
for (const file of required) await access(join(root, file), constants.R_OK)
const client = await readFile(join(root, 'client/client.js'), 'utf8')
if (!/^window\.__ModuleLoader__\.load\(\{\s*id:\s*["']dsh-skin-market["']/.test(client)) {
  throw new Error('client bundle is missing the DSH module-loader wrapper')
}
const catalog = JSON.parse(await readFile(join(root, 'data/catalog.json'), 'utf8'))
if (!Array.isArray(catalog.skins) || catalog.skins.length < 3) throw new Error('expected at least three bundled skins')
console.log('package preflight passed')
