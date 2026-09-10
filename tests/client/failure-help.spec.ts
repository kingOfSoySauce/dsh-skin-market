import { describe, expect, it } from 'vitest'
import {
  failureHelpLinks,
  interceptNotice,
  isInterceptFailure,
  MARKET_INSTALL_TROUBLESHOOT_URL,
  MARKET_MANUAL_UPDATE_URL,
  marketUpdateNotice,
  skinRepositoryBrowseUrl,
} from '../../src/client/failure-help.ts'
import type { CatalogSkin, Operation } from '../../src/client/types.ts'

const skin = {
  id: 'test.skin', name: { zh: '测试皮肤', en: 'Test Skin' }, author: 'author', description: 'description',
  repo: 'https://github.com/a/b.git', package: 'skin', rowId: 'skin',
  tags: ['dark'], modes: ['dark'],
  install: { target: 'https://github.com/a/b.git#aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', version: '1.0.0', commit: 'a'.repeat(40) },
  compatibility: { dsh: '0.1.0-rc.6', platform: ['web'] },
  screenshots: [], license: { code: 'MIT', commercialUse: true }, githubStars: 0, starsStale: false,
  starsUpdatedAt: '2026-08-16T00:00:00Z', recommendations: [], releaseUpdatedAt: '2026-08-16T00:00:00Z',
  metadataUpdatedAt: '2026-08-16T00:00:00Z', updatedAt: '2026-08-16T00:00:00Z',
} satisfies CatalogSkin

const nested = { ...skin, subpath: 'packages/glass' }

function failed(kind: NonNullable<Operation['failure']>['kind'], message: string, extra: Partial<Operation> = {}): Operation {
  return {
    id: 'op', kind: 'install', skinId: skin.id, phase: 'failed', startedAt: '2026-09-10T00:00:00Z',
    message, failure: { kind, message }, ...extra,
  }
}

describe('failure help', () => {
  it('pins a skin repository to the catalog commit and subpath', () => {
    expect(skinRepositoryBrowseUrl(skin)).toBe(`https://github.com/a/b/tree/${'a'.repeat(40)}`)
    expect(skinRepositoryBrowseUrl(nested)).toBe(`https://github.com/a/b/tree/${'a'.repeat(40)}/packages/glass`)
  })

  it('sends market self-update environment failures to troubleshooting, others to manual update', () => {
    expect(failureHelpLinks({ source: 'market-update', failureKind: 'unexpected-store' })).toEqual([
      { href: MARKET_INSTALL_TROUBLESHOOT_URL, label: '查看安装排查' },
    ])
    expect(failureHelpLinks({ source: 'market-update', failureKind: 'command' })).toEqual([
      { href: MARKET_MANUAL_UPDATE_URL, label: '查看手动更新' },
    ])
  })

  it('does not send local conflicts to GitHub, and pins packaging/compat failures to the skin commit', () => {
    expect(failureHelpLinks({ source: 'skin', failureKind: 'conflict', skin })).toEqual([])
    expect(failureHelpLinks({ source: 'skin', failureKind: 'fetch-404', skin })).toEqual([
      { href: MARKET_INSTALL_TROUBLESHOOT_URL, label: '查看安装排查' },
    ])
    expect(failureHelpLinks({
      source: 'skin',
      message: `${skin.package} bundle patch is missing: ./cordis.patch.yml`,
      skin,
    })).toEqual([{ href: `https://github.com/a/b/tree/${'a'.repeat(40)}`, label: '打开皮肤仓库' }])
    expect(failureHelpLinks({ source: 'skin', failureKind: 'command', skin })).toEqual([
      { href: `https://github.com/a/b/tree/${'a'.repeat(40)}`, label: '打开皮肤仓库' },
      { href: MARKET_INSTALL_TROUBLESHOOT_URL, label: '查看安装排查' },
    ])
  })

  it('keeps retryable failures out of the intercept dialog', () => {
    expect(isInterceptFailure(failed('network', '网络错误', { failure: { kind: 'network', message: '网络错误', action: 'retry' } }))).toBe(false)
    expect(isInterceptFailure(failed('unexpected-store', 'store'))).toBe(true)
  })

  it('attaches the skin commit link to a packaging intercept', () => {
    const notice = interceptNotice(failed('command', `${skin.package} bundle patch is missing: ./cordis.patch.yml`), '液态玻璃', skin)
    expect(notice.title).toBe('已拦截安装')
    expect(notice.links).toEqual([{ href: `https://github.com/a/b/tree/${'a'.repeat(40)}`, label: '打开皮肤仓库' }])
  })

  it('explains a market store mismatch with the troubleshooting README', () => {
    const notice = marketUpdateNotice({
      failure: { kind: 'unexpected-store', message: '当前 profile 的 node_modules 由另一代 pnpm store 链接' },
    })
    expect(notice.title).toBe('皮肤市场更新失败')
    expect(notice.links).toEqual([{ href: MARKET_INSTALL_TROUBLESHOOT_URL, label: '查看安装排查' }])
  })
})
