import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
// @ts-expect-error The documentation helper is intentionally plain ESM.
import { updateProjectDocs } from '../scripts/update-docs.mjs'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('automated project documentation updates', () => {
  it('writes user-facing recent entries and prefers a GIF over static images', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-doc-test-'))
    temporaryRoots.push(root)
    await mkdir(join(root, 'docs'))
    await writeFile(join(root, 'README.md'), '# Test\n\n### 近期收录\n\n- **2026-08-01**：旧条目\n\n## 安装\n\n安装说明必须保留。\n')
    await writeFile(join(root, 'docs/recently-added.md'), '# 近期收录\n\n## 手动记录\n')

    await updateProjectDocs({
      root,
      catalogCount: 142,
      syncAt: '2026-08-18T16:00:00.000Z',
      changes: [{
        id: 'demo.skin',
        name: { zh: 'Demo' },
        author: 'Example',
        repo: 'https://github.com/example/demo',
        description: 'Demo\n skin',
        updatedAt: '2026-08-18T15:00:00.000Z',
        install: { version: '1.0.0', commit: 'a'.repeat(40) },
        screenshots: ['skin-screenshots/example/demo/' + 'a'.repeat(40) + '/home.png', 'skin-screenshots/example/demo/' + 'a'.repeat(40) + '/home.gif'],
      }],
    })

    const readme = await readFile(join(root, 'README.md'), 'utf8')
    const recent = await readFile(join(root, 'docs/recently-added.md'), 'utf8')
    expect(readme).toContain('Demo')
    expect(readme).not.toContain('142 款')
    expect(readme).not.toContain('最近一次自动同步')
    expect(recent).toContain('demo.skin')
    expect(recent).toContain('作者：Example')
    expect(recent).toContain('Demo skin')
    expect(recent).toContain('/home.gif')
    expect(recent).not.toContain('固定 commit')
    expect(recent).not.toContain('收录版本')
    expect(recent).not.toContain('许可')
    expect(recent).toContain('## 手动记录')
  })
})
