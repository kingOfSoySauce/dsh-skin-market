import { existsSync } from 'node:fs'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { INSTALL_POLICY_PATH, validateInstallPolicies } from './install-policies.mjs'

/**
 * Bootstrap data/install-policies.json from the v1 pinned entries.
 *
 * This does not decide anything: it records the artifact each entry already
 * installs today, so the release ledger has a schema-stable starting point.
 * After seeding, ops may move a policy's resolved artifact forward without
 * touching the reviewed v1 install fields.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const write = process.argv.includes('--write')
const check = process.argv.includes('--check')
const sourceDir = join(root, 'registry/skins')
const file = join(root, INSTALL_POLICY_PATH)
const files = (await readdir(sourceDir)).filter(name => name.endsWith('.yml')).sort()
const skins = []
for (const name of files) skins.push(parse(await readFile(join(sourceDir, name), 'utf8')))

let previous
if (existsSync(file)) {
  try {
    previous = validateInstallPolicies(JSON.parse(await readFile(file, 'utf8')), skins)
  } catch (error) {
    if (!check) throw error
    console.error(INSTALL_POLICY_PATH + ': ' + (error instanceof Error ? error.message : String(error)))
    process.exit(1)
  }
}

const now = new Date().toISOString()
const policies = {}
for (const skin of skins) {
  const npm = skin.install?.npm
  if (npm === undefined) continue
  // Companion installs are pinned as a unit; the resolver intentionally skips
  // them until companion release observations exist.
  if ((skin.install.companions?.length ?? 0) > 0) continue
  const prior = previous?.[skin.id]
  const same = prior !== undefined
    && prior.mode === 'npm' && prior.package === skin.package
    && prior.resolved.version === npm.version
    && prior.resolved.commit === (npm.gitHead ?? skin.install.commit).toLowerCase()
    && prior.resolved.integrity === npm.integrity
  policies[skin.id] = same ? prior : {
    schema: 'install-policy-v1',
    mode: 'npm',
    package: skin.package,
    resolved: {
      version: npm.version,
      commit: (npm.gitHead ?? skin.install.commit).toLowerCase(),
      integrity: npm.integrity,
      gitHead: (npm.gitHead ?? skin.install.commit).toLowerCase(),
      observedAt: now,
    },
  }
}

const sorted = Object.fromEntries(Object.entries(policies).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))
const unchanged = previous !== undefined && JSON.stringify(previous) === JSON.stringify(sorted)
const generatedAt = unchanged && existsSync(file)
  ? JSON.parse(await readFile(file, 'utf8')).generatedAt
  : now
const payload = { schemaVersion: 1, generatedAt, policies: sorted }
const bytes = JSON.stringify(payload, null, 2) + '\n'

if (check) {
  if (!existsSync(file) || await readFile(file, 'utf8') !== bytes) {
    console.error(INSTALL_POLICY_PATH + ' is out of date; run node scripts/seed-install-policies.mjs --write')
    process.exit(1)
  }
  console.log(INSTALL_POLICY_PATH + ': ' + Object.keys(sorted).length + ' policies, up to date')
} else if (write) {
  await writeFile(file, bytes)
  console.log(INSTALL_POLICY_PATH + ': wrote ' + Object.keys(sorted).length + ' policies')
} else {
  console.log(INSTALL_POLICY_PATH + ': ' + Object.keys(sorted).length + ' policies would be written (' + (unchanged ? 'unchanged' : 'changed') + '); pass --write')
}
