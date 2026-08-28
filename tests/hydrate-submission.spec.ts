import { describe, expect, it } from 'vitest'
import { hydrateSkinSubmission, isThinSubmission, parseGitHubTarget, submissionFilename } from '../scripts/hydrate-submission.mjs'

describe('thin registry submissions', () => {
  it('accepts url-only drafts and GitHub tree paths', () => {
    expect(isThinSubmission({ url: 'https://github.com/example/dsh-skin' })).toBe(true)
    expect(isThinSubmission({ url: 'https://github.com/example/dsh-skin', description: '玻璃皮肤' })).toBe(true)
    expect(isThinSubmission({ url: 'https://github.com/example/dsh-skin', id: 'example.dsh-skin' })).toBe(false)
    expect(parseGitHubTarget('https://github.com/example/dsh-skins/tree/main/packages/ocean')).toMatchObject({
      fullName: 'example/dsh-skins',
      subpath: 'packages/ocean',
    })
    expect(submissionFilename({ owner: 'example', repo: 'dsh-skins', subpath: 'packages/ocean' })).toBe('example__dsh-skins--packages--ocean.yml')
  })

  it('hydrates package, loader id, license and screenshots from the skin repository', async () => {
    const files = {
      'package.json': JSON.stringify({
        name: '@rison/dsh-endfield-ui',
        version: '1.2.3',
        description: 'Endfield UI',
        license: 'MIT',
        dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } },
        exports: { './client': './dist/client.js' },
      }),
      'cordis.patch.yml': `- insert:\n    - id: better-sidebar\n      name: dsh-better-sidebar\n    - id: endfield-ui\n      name: '@rison/dsh-endfield-ui'\n`,
      'README.md': '![preview](docs/home.png)\n',
      'LICENSE': 'MIT License',
      'dist/client.js': 'export {}',
      'screenshots.json': JSON.stringify(['docs/settings.png']),
    }
    const fetchText = async url => {
      if (url.includes('api.github.com/repos/example/dsh-endfield')) {
        return { default_branch: 'main', stargazers_count: 4, topics: ['dsh-plugin'] }
      }
      const file = Object.keys(files).find(path => url.endsWith(`/deadbeefdeadbeefdeadbeefdeadbeefdeadbeef/${path}`))
      return file ? files[file] : null
    }

    const skin = await hydrateSkinSubmission(
      { url: 'https://github.com/example/dsh-endfield', description: '作者写的描述' },
      { fetchText, sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', now: '2026-08-28T00:00:00.000Z' },
    )

    expect(skin.id).toBe('example.dsh.endfield')
    expect(skin.rowId).toBe('endfield-ui')
    expect(skin.description).toBe('作者写的描述')
    expect(skin.install.commit).toBe('deadbeefdeadbeefdeadbeefdeadbeefdeadbeef')
    expect(skin.package).toBe('@rison/dsh-endfield-ui')
    expect(skin.license.code).toBe('MIT')
    expect(skin.screenshots).toEqual([
      'https://raw.githubusercontent.com/example/dsh-endfield/deadbeefdeadbeefdeadbeefdeadbeefdeadbeef/docs/settings.png',
      'https://raw.githubusercontent.com/example/dsh-endfield/deadbeefdeadbeefdeadbeefdeadbeefdeadbeef/docs/home.png',
    ])
    expect(skin.starsSnapshot).toBe(4)
  })
})
