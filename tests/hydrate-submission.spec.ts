import { describe, expect, it } from 'vitest'
import { hydrateSkinSubmission, isThinSubmission, parseGitHubTarget, readmeImageValues, statedDshCompatibility, submissionFilename, thinSubmissionHint } from '../scripts/hydrate-submission.mjs'

describe('thin registry submissions', () => {
  it('accepts url-only drafts and GitHub tree paths', () => {
    expect(isThinSubmission({ url: 'https://github.com/example/dsh-skin' })).toBe(true)
    expect(isThinSubmission({ url: 'https://github.com/example/dsh-skin', description: '玻璃皮肤' })).toBe(true)
    expect(isThinSubmission({ url: 'https://github.com/example/dsh-skin', id: 'example.dsh-skin' })).toBe(false)
    expect(isThinSubmission({
      url: 'https://github.com/example/dsh-skin',
      package: 'dsh-skin',
      tags: ['retro'],
    })).toBe(false)
    expect(thinSubmissionHint({
      url: 'https://github.com/example/dsh-skin',
      package: 'dsh-skin',
      rowId: 'skin',
      tags: ['retro'],
    })).toContain('extra keys: package, rowId, tags')
    expect(thinSubmissionHint({
      url: 'https://github.com/example/dsh-skin',
      install: { target: 'github:example/dsh-skin' },
    })).toBe('')
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

  it('reads Web and official Desktop version declarations from the README', () => {
    expect(statedDshCompatibility('兼容 DSH Web >=0.1.0-rc.6，官方 Desktop >=0.2.0-rc.1')).toBe('>=0.1.0-rc.6 || >=0.2.0-rc.1')
    expect(statedDshCompatibility('插件页入口已对照 Web `0.1.7-rc.2` 与官方 Desktop `0.2.1-rc.2` 的契约')).toBe('0.1.7-rc.2 || 0.2.1-rc.2')
    expect(statedDshCompatibility('支持 DSH 0.1.0-rc.6 及以上')).toBe('>=0.1.0-rc.6')
    expect(statedDshCompatibility('支持 DSH >=0.1.5-rc.1 <0.2.0-0 || >=0.2.0-rc.1')).toBe('>=0.1.5-rc.1 <0.2.0-0 || >=0.2.0-rc.1')
    expect(statedDshCompatibility('下载 leon___-dsh-client-liang-intensity-skin-0.1.11.tgz')).toBeNull()
  })

  it('reads inline, reference and HTML README images', () => {
    expect(readmeImageValues([
      '<p><img src="./docs/home.png" width="70%"></p>',
      '![inline](docs/a.png)',
      '![ref][logo]',
      '[logo]: https://example.com/c.webp',
    ].join('\n'))).toEqual(['docs/a.png', 'https://example.com/c.webp', './docs/home.png'])
  })

  it('hydrates Desktop compatibility and HTML README screenshots', async () => {
    const files = {
      'package.json': JSON.stringify({
        name: 'desktop-skin',
        version: '1.0.0',
        description: 'Desktop skin',
        license: 'MIT',
        dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } },
        exports: { './client': './lib/client.js' },
      }),
      'cordis.patch.yml': `- insert:\n    - id: desktop-skin\n      name: desktop-skin\n`,
      'README.md': '<p><img src="./docs/home.png" alt="home"></p>\n\n兼容 DSH Web >=0.1.0-rc.6，官方 Desktop >=0.2.0-rc.1。\n\ndsh plugin --profile web add "desktop-skin"\n',
      'LICENSE': 'MIT License',
      'lib/client.js': 'export {}',
    }
    const fetchText = async url => {
      if (url.includes('api.github.com/repos/owner/desktop-skin')) {
        return { default_branch: 'main', stargazers_count: 2, topics: ['dsh-plugin'] }
      }
      const file = Object.keys(files).find(path => url.endsWith(`/deadbeefdeadbeefdeadbeefdeadbeefdeadbeef/${path}`))
      return file ? files[file] : null
    }

    const skin = await hydrateSkinSubmission(
      { url: 'https://github.com/owner/desktop-skin' },
      { fetchText, sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', now: '2026-11-10T00:00:00.000Z' },
    )

    expect(skin.compatibility).toMatchObject({ dsh: '>=0.1.0-rc.6 || >=0.2.0-rc.1', platform: ['web'] })
    expect(skin.screenshots).toEqual(['https://raw.githubusercontent.com/owner/desktop-skin/deadbeefdeadbeefdeadbeefdeadbeefdeadbeef/docs/home.png'])
    expect(skin.health.checks).toMatchObject({ readmeScreenshots: 'pass', compatibility: 'pass' })
  })
})
