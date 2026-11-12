import { readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as {
  icon?: string
  exports?: Record<string, string>
  files?: string[]
}

describe('plugin page metadata', () => {
  it('exports localized display text for the host plugin page', () => {
    for (const language of ['en', 'zh']) {
      const { meta } = JSON.parse(readFileSync(new URL(`locale/${language}.json`, root), 'utf8')) as {
        meta?: { title?: string; description?: string }
      }
      expect(meta?.title?.trim()).not.toBe('')
      expect(meta?.description?.trim()).not.toBe('')
    }
    expect(manifest.exports?.['./locale/*.json']).toBe('./locale/*.json')
    expect(manifest.files).toContain('locale')
  })

  it('ships a theme-aware SVG icon inside the host size limit', () => {
    expect(manifest.icon).toBe('assets/icon.svg')
    const icon = new URL(manifest.icon ?? '', root)
    expect(statSync(icon).size).toBeLessThan(256 * 1024)
    expect(readFileSync(icon, 'utf8')).toContain('prefers-color-scheme: dark')
  })
})
