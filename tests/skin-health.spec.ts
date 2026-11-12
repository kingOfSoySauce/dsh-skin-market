import { describe, expect, it } from 'vitest'
// The ingestion pipeline is intentionally plain ESM so GitHub Actions can run it without a TypeScript build.
// @ts-expect-error The JavaScript helper has no declaration file.
import { clientEntryPath, inspectSkinHealth } from '../scripts/skin-health.mjs'

const installablePackage = {
  name: 'example-skin',
  version: '1.0.0',
  exports: { './client': './lib/client.js' },
  dsh: { client: { platform: 'web' } },
}

describe('repository health', () => {
  it('recognizes a repository prepared for display, compatibility checks, and one-click installation', () => {
    expect(clientEntryPath(installablePackage)).toBe('./lib/client.js')
    expect(inspectSkinHealth({ pkg: installablePackage, rowId: 'example-skin', readmeScreenshotCount: 2, compatibility: '0.1.0-rc.6', clientEntryPresent: true, readmeHasInstallCommand: true, hasDshPluginTopic: true })).toEqual({
      status: 'healthy',
      checks: { readmeScreenshots: 'pass', compatibility: 'pass', installation: 'pass', installCommand: 'pass', topic: 'pass' },
      suggestions: [],
    })
  })

  it('returns constructive suggestions for each missing market convention', () => {
    const result = inspectSkinHealth({ pkg: installablePackage, rowId: null, readmeScreenshotCount: 0, compatibility: null, clientEntryPresent: false, readmeHasInstallCommand: false, hasDshPluginTopic: false })
    expect(result).toMatchObject({
      status: 'improvements',
      checks: { readmeScreenshots: 'improve', compatibility: 'improve', installation: 'improve', installCommand: 'improve', topic: 'improve' },
    })
    expect(result.suggestions).toHaveLength(5)
    expect(result.suggestions.join(' ')).toContain('符合 dsh 插件要求')
    expect(result.suggestions.join(' ')).toContain('安装命令')
    expect(result.suggestions.join(' ')).toContain('官方 Desktop')
    expect(result.suggestions.join(' ')).toContain('dsh-plugin Topic')
    expect(result.suggestions.join(' ')).not.toContain('无法安装')
  })
})
