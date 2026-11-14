import { describe, expect, it } from 'vitest'
import { compatibility, hydrateSkinSubmission, isThinSubmission, parseGitHubTarget, readmeImageValues, statedDshCompatibility, submissionFilename, thinSubmissionHint } from '../scripts/hydrate-submission.mjs'

describe('thin registry submissions', () => {
  it('accepts url-only drafts and GitHub tree paths', () => {
    expect(isThinSubmission({ url: 'https://github.com/example/dsh-skin' })).toBe(true)
    expect(isThinSubmission({ url: 'https://github.com/example/dsh-skin', description: '玻璃皮肤' })).toBe(true)
    expect(isThinSubmission({
      url: 'https://github.com/example/dsh-skin',
      category: 'pet',
      tags: ['retro'],
      modes: ['dark'],
    })).toBe(true)
    expect(isThinSubmission({ url: 'https://github.com/example/dsh-skin', id: 'example.dsh-skin' })).toBe(false)
    expect(isThinSubmission({
      url: 'https://github.com/example/dsh-skin',
      package: 'dsh-skin',
      rowId: 'skin',
    })).toBe(false)
    expect(thinSubmissionHint({
      url: 'https://github.com/example/dsh-skin',
      package: 'dsh-skin',
      rowId: 'skin',
    })).toContain('extra keys: package, rowId')
    expect(thinSubmissionHint({
      url: 'https://github.com/example/dsh-skin',
      category: 'pet',
      tags: ['retro'],
      modes: ['dark'],
    })).toBe('')
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
    expect(skin.name).toEqual({ zh: 'dsh-endfield', en: 'dsh-endfield' })
    expect(skin.author).toBe('example')
    expect(skin.category).toBe('skin')
    expect(skin.tags).toEqual(['appearance'])
    expect(skin.modes).toEqual(['light', 'dark'])
  })

  it('uses author-provided display fields instead of the hydration defaults', async () => {
    const sha = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
    const files: Record<string, string> = {
      'package.json': JSON.stringify({
        name: '@fixture/glass',
        version: '1.0.0',
        license: 'MIT',
        dsh: { client: { platform: 'web' } },
      }),
      'cordis.patch.yml': '- insert:\n    - id: glass-skin\n      name: "@fixture/glass"\n',
      'README.md': '',
      'LICENSE': 'MIT License',
      'dist/client.js': 'export {}',
    }
    const fetchText = async (url: string) => {
      if (url.includes('api.github.com/repos/example/glass')) return { default_branch: 'main', stargazers_count: 0, topics: [] }
      const file = Object.keys(files).find(path => url.endsWith(`/${sha}/${path}`))
      return file ? files[file] : null
    }

    const skin = await hydrateSkinSubmission({
      url: 'https://github.com/example/glass',
      name: { zh: '玻璃皮肤', en: 'Glass Skin' },
      author: 'Alice',
      description: '作者写的描述',
      category: 'pet',
      tags: ['retro', 'neon'],
      modes: ['dark'],
    }, { fetchText, sha, now: '2026-11-13T00:00:00.000Z' })

    expect(skin.name).toEqual({ zh: '玻璃皮肤', en: 'Glass Skin' })
    expect(skin.author).toBe('Alice')
    expect(skin.description).toBe('作者写的描述')
    expect(skin.category).toBe('pet')
    expect(skin.tags).toEqual(['retro', 'neon'])
    expect(skin.modes).toEqual(['dark'])
  })

  it('rejects invalid author-provided thin fields before fetching', async () => {
    const fetchText = async () => { throw new Error('network should not run') }
    const url = 'https://github.com/example/glass'
    await expect(hydrateSkinSubmission({ url, category: 'theme' }, { fetchText })).rejects.toThrow(/category must be one of skin, pet, player, splash/)
    await expect(hydrateSkinSubmission({ url, tags: [] }, { fetchText })).rejects.toThrow(/tags must be a non-empty array/)
    await expect(hydrateSkinSubmission({ url, tags: ['ok', 3] }, { fetchText })).rejects.toThrow(/tags must be a non-empty array/)
    await expect(hydrateSkinSubmission({ url, modes: ['sepia'] }, { fetchText })).rejects.toThrow(/modes must be a non-empty subset of light, dark/)
    await expect(hydrateSkinSubmission({ url, modes: [] }, { fetchText })).rejects.toThrow(/modes must be a non-empty subset of light, dark/)
    await expect(hydrateSkinSubmission({ url, name: { zh: '只有中文' } }, { fetchText })).rejects.toThrow(/name must provide both zh and en/)
    await expect(hydrateSkinSubmission({}, { fetchText })).rejects.toThrow(/url is required/)
    await expect(hydrateSkinSubmission({ url: 'https://example.com/a/b' }, { fetchText })).rejects.toThrow(/url must be a GitHub repository/)
    await expect(hydrateSkinSubmission({ url, subpath: '' }, { fetchText })).rejects.toThrow(/subpath must be a non-empty string/)
  })

  it('reads Web and official Desktop version declarations from the README', () => {
    expect(statedDshCompatibility('兼容 DSH Web >=0.1.0-rc.6，官方 Desktop >=0.2.0-rc.1')).toBe('>=0.1.0-rc.6 || >=0.2.0-rc.1')
    expect(statedDshCompatibility('支持 DSH 0.1.0-rc.6 及以上')).toBe('>=0.1.0-rc.6')
    expect(statedDshCompatibility('支持 DSH >=0.1.5-rc.1 <0.2.0-0 || >=0.2.0-rc.1')).toBe('>=0.1.5-rc.1 <0.2.0-0 || >=0.2.0-rc.1')
    expect(statedDshCompatibility('下载 leon___-dsh-client-liang-intensity-skin-0.1.11.tgz')).toBeNull()
  })

  it('ignores bare versions (including pre-releases) in README prose', () => {
    // A bare version is a verification note or a package pin, not a host range.
    expect(statedDshCompatibility('插件页入口已对照 Web `0.1.7-rc.2` 与官方 Desktop `0.2.1-rc.2` 的契约')).toBeNull()
    const readme = [
      '**兼容范围：** 支持 DSH Web 与 DSH Desktop `^0.2.1-rc.5 || ^0.2.2-rc.1`。DSH Desktop 通过应用内嵌的 Web 界面加载本皮肤。`0.2.1-rc.5` 已有实机验证；`0.2.2-rc.1` 的验证范围见[兼容性](#兼容性)。',
      '运行 DSH `0.2.2-rc.1` CLI 时遵守宿主的运行时要求。',
      '## 兼容性',
      '- 声明范围：DSH Web / Desktop `^0.2.1-rc.5 || ^0.2.2-rc.1`。`0.2.1-rc.5` 已有实机验证。',
    ].join('\n')
    expect(statedDshCompatibility(readme)).toBe('^0.2.1-rc.5 || ^0.2.2-rc.1')
  })

  it('deduplicates clauses and drops clauses contained in a longer one', () => {
    expect(statedDshCompatibility('兼容 DSH >=0.1.0-rc.6 <0.2.0；另见 DSH >=0.1.0-rc.6')).toBe('>=0.1.0-rc.6 <0.2.0')
    expect(statedDshCompatibility('DSH >=0.2.0-rc.1；DSH >=0.2.0-rc.1')).toBe('>=0.2.0-rc.1')
  })

  it('keeps at most four compatibility clauses', () => {
    expect(statedDshCompatibility('DSH >=0.1.0 DSH >=0.1.1 DSH >=0.1.2 DSH >=0.1.3 DSH >=0.1.4')).toBe('>=0.1.0 || >=0.1.1 || >=0.1.2 || >=0.1.3')
  })

  it('prefers package engines.dsh, then README, then dsh-* dependencies', () => {
    expect(compatibility({ engines: { dsh: '>=0.2.0-rc.1' } }, '兼容 DSH >=0.9.9')).toBe('>=0.2.0-rc.1')
    expect(compatibility({ engines: { dsh: 'workspace:*' } }, '兼容 DSH >=0.2.0-rc.1')).toBe('>=0.2.0-rc.1')
    expect(compatibility({ engines: { dsh: 'unverified' } }, '')).toBeNull()
    expect(compatibility({}, '兼容 DSH >=0.2.0-rc.1')).toBe('>=0.2.0-rc.1')
    expect(compatibility({
      dependencies: { '@deepseek-ai/dsh-client-runtime': 'workspace:*', '@deepseek-ai/dsh-client-ui': '^0.1.0-rc.6' },
    }, '')).toBe('^0.1.0-rc.6')
    expect(compatibility({}, '')).toBeNull()
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

  it('hydrates compatibility from package engines.dsh before the README statement', async () => {
    const sha = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
    const files: Record<string, string> = {
      'package.json': JSON.stringify({
        name: 'engines-skin',
        version: '1.0.0',
        description: 'Engines skin',
        license: 'MIT',
        engines: { dsh: '>=0.2.0-rc.1' },
        dsh: { client: { platform: 'web' } },
        exports: { './client': './dist/client.js' },
      }),
      'cordis.patch.yml': '- insert:\n    - id: engines-skin\n      name: engines-skin\n',
      'README.md': '兼容 DSH Web >=0.1.0-rc.6，官方 Desktop >=0.2.0-rc.1。\n',
      'LICENSE': 'MIT License',
      'dist/client.js': 'export {}',
    }
    const fetchText = async (url: string) => {
      if (url.includes('api.github.com/repos/owner/engines-skin')) return { default_branch: 'main', stargazers_count: 1, topics: [] }
      const file = Object.keys(files).find(path => url.endsWith(`/${sha}/${path}`))
      return file ? files[file] : null
    }
    const skin = await hydrateSkinSubmission(
      { url: 'https://github.com/owner/engines-skin' },
      { fetchText, sha, now: '2026-11-14T00:00:00.000Z' },
    )
    expect(skin.compatibility).toMatchObject({ dsh: '>=0.2.0-rc.1', platform: ['web'] })
    expect(skin.review.compatibility).toBe('verified')
  })
})

it('orders hydrated README screenshots GIF-first so the market cover keeps the animation', async () => {
  const sha = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
  const files: Record<string, string> = {
    'package.json': JSON.stringify({
      name: '@fixture/animated',
      version: '1.0.0',
      license: 'MIT',
      dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } },
    }),
    'cordis.patch.yml': '- insert:\n    - id: animated-skin\n      name: "@fixture/animated"\n',
    'README.md': '![home](docs/home.png)\n\n![demo](docs/demo.gif)\n\n![chat](docs/chat.png)\n',
    'LICENSE': 'MIT License',
  }
  const fetchText = async (url: string) => {
    if (url.includes('api.github.com/repos/example/animated')) return { default_branch: 'main', stargazers_count: 0, topics: [] }
    const file = Object.keys(files).find(path => url.endsWith(`/${sha}/${path}`))
    return file ? files[file] : null
  }

  const skin = await hydrateSkinSubmission(
    { url: 'https://github.com/example/animated', description: '动画皮肤' },
    { fetchText, sha, now: '2026-11-14T00:00:00.000Z' },
  )

  expect(skin.screenshots.map(url => url.split('/').pop())).toEqual(['demo.gif', 'home.png', 'chat.png'])
})

it('keeps author-declared screenshots before the GIF-first README images', async () => {
  const sha = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
  const declared = `https://raw.githubusercontent.com/example/animated/${sha}/docs/declared.png`
  const files: Record<string, string> = {
    'package.json': JSON.stringify({
      name: '@fixture/animated',
      version: '1.0.0',
      license: 'MIT',
      dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } },
    }),
    'cordis.patch.yml': '- insert:\n    - id: animated-skin\n      name: "@fixture/animated"\n',
    'README.md': '![home](docs/home.png)\n\n![demo](docs/demo.gif)\n',
    'LICENSE': 'MIT License',
  }
  const fetchText = async (url: string) => {
    if (url.includes('api.github.com/repos/example/animated')) return { default_branch: 'main', stargazers_count: 0, topics: [] }
    const file = Object.keys(files).find(path => url.endsWith(`/${sha}/${path}`))
    return file ? files[file] : null
  }

  const skin = await hydrateSkinSubmission(
    { url: 'https://github.com/example/animated', description: '动画皮肤', screenshots: [declared] },
    { fetchText, sha, now: '2026-11-14T00:00:00.000Z' },
  )

  expect(skin.screenshots.map(url => url.split('/').pop())).toEqual(['declared.png', 'demo.gif', 'home.png'])
})
