import { describe, expect, it } from 'vitest'
import { checkLoaderIdentity, patchUrl } from '../scripts/check-loader-identity.mjs'

const patch = (id, name = 'dsh-skin') => `- insert:\n    - id: ${id}\n      name: '${name}'\n`

function entry(overrides = {}) {
  return {
    file: 'registry/skins/a__b.yml',
    value: {
      repo: 'https://github.com/a/b',
      package: 'dsh-skin',
      rowId: 'ui-skin-a',
      install: { commit: 'a'.repeat(40) },
      ...overrides,
    },
  }
}

describe('loader identity admission check', () => {
  it('accepts a row id that matches the pinned patch', async () => {
    const result = await checkLoaderIdentity([entry()], {
      fetchPatch: async () => ({ status: 'ok', text: patch('ui-skin-a') }),
    })
    expect(result).toEqual({ checked: 1, failures: [], warnings: [] })
  })

  it('reports the id the patch declares when the catalog disagrees', async () => {
    const result = await checkLoaderIdentity([entry({ rowId: 'nwflower-dsh-claude-style' })], {
      fetchPatch: async () => ({ status: 'ok', text: patch('ui-skin-claude-style', 'dsh-skin') }),
    })
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]).toContain('nwflower-dsh-claude-style')
    expect(result.failures[0]).toContain('ui-skin-claude-style')
  })

  it('does not fail when the pinned patch cannot be read', async () => {
    for (const status of ['missing', 'unavailable']) {
      const result = await checkLoaderIdentity([entry()], { fetchPatch: async () => ({ status, detail: 'HTTP 500' }) })
      expect(result.failures).toEqual([])
      expect(result.warnings).toHaveLength(1)
      expect(result.checked).toBe(0)
    }
  })

  it('skips repositories whose bundle patch names no package row', async () => {
    const result = await checkLoaderIdentity([entry()], {
      fetchPatch: async () => ({ status: 'ok', text: patch('other', 'something-else') }),
    })
    expect(result.failures).toEqual([])
    expect(result.warnings[0]).toContain('bundle patch has no loader')
  })

  it('fails an ambiguous or id-less primary row', async () => {
    const ambiguous = await checkLoaderIdentity([entry()], {
      fetchPatch: async () => ({ status: 'ok', text: `${patch('a', 'dsh-skin')}${patch('b', 'dsh-skin').replace('- insert:', '- insert:')}` }),
    })
    expect(ambiguous.failures[0]).toContain('multiple loaders')
  })

  it('builds the raw URL for monorepo subpaths', () => {
    expect(patchUrl(entry().value)).toBe(`https://raw.githubusercontent.com/a/b/${'a'.repeat(40)}/cordis.patch.yml`)
    expect(patchUrl({ ...entry().value, subpath: 'packages/skin' }))
      .toBe(`https://raw.githubusercontent.com/a/b/${'a'.repeat(40)}/packages/skin/cordis.patch.yml`)
    expect(patchUrl({ ...entry().value, install: { commit: 'main' } })).toBeNull()
  })
})
