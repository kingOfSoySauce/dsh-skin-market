// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'

const shownDialogs = vi.hoisted(() => [] as string[])
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const icon = () => React.createElement('span', { 'aria-hidden': true })
  return {
    Button: ({ icon: leading, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }) => React.createElement('button', props, leading, children),
    Input: ({ icon: _icon, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode }) => React.createElement('input', props),
    Pill: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => React.createElement('button', props, children),
    Switch: ({ checked, onChange, label, ...props }: { checked: boolean; onChange: (next: boolean) => void; label: string; className?: string }) => React.createElement('button', { ...props, type: 'button', role: 'switch', 'aria-checked': checked, 'aria-label': label, onClick: () => onChange(!checked) }),
    Modal: ({ open, title, description, children, footer, onClose, closeLabel = '关闭', className }: {
      open: boolean; title: string; description?: string; children?: React.ReactNode; footer?: React.ReactNode
      onClose?: () => void; closeLabel?: string; className?: string
    }) => {
      if (!open) return null
      shownDialogs.push(title)
      return React.createElement('div', { role: 'dialog', 'aria-label': title, className },
        React.createElement('h2', null, title), React.createElement('button', { 'aria-label': closeLabel, onClick: onClose }), description, children, footer)
    },
    IconChevronLeftOutline14: icon, IconChevronDownOutline14: icon, IconCheckOutline16: icon, IconCopyOutline16: icon, IconDownloadOutline16: icon, IconLinkOutline16: icon, IconLoadingOutline16: icon,
    IconRefreshOutline16: icon, IconSearchOutline16: icon, IconTrashOutline16: icon,
    IconChevronLeftOutlineRegular: icon, IconChevronDownOutlineRegular: icon, IconCheckOutlineRegular: icon, IconCloseOutlineRegular: icon, IconCopyOutlineRegular: icon, IconDownloadOutlineRegular: icon, IconLoadingOutlineRegular: icon,
    IconRefreshOutlineRegular: icon, IconSearchOutlineRegular: icon, IconTrashOutlineRegular: icon,
  }
})

import { SkinMarketSection } from '../../src/client/SkinMarketSection.tsx'
import { compatibilityContext } from '../../src/compatibility.ts'
import { setGeneratedMediaSources } from '../../src/media-preview.ts'
import type { CatalogSkin, ConfigurationOverridePlan, RuntimeSkin } from '../../src/client/types.ts'

const target = {
  id: 'new.skin', package: 'new-skin', rowId: 'ui-new-skin', name: { zh: '新皮肤', en: 'New Skin' },
  author: 'author', description: 'description', repo: 'https://github.com/example/new-skin', tags: ['dark'], modes: ['dark'],
  install: { target: 'new-skin@1.0.0', version: '1.0.0', commit: 'a'.repeat(40), desktop: { mode: 'managed', registry: 'npm', packageName: 'new-skin', packageVersion: '1.0.0' } },
  compatibility: { dsh: '>=0.1.0-rc.6', platform: ['web', 'desktop'] }, screenshots: [],
  license: { code: 'MIT', commercialUse: true }, githubStars: 0, starsStale: false, starsUpdatedAt: '2026-10-16T00:00:00Z', recommendations: [],
  releaseUpdatedAt: '2026-10-16T00:00:00Z', metadataUpdatedAt: '2026-10-16T00:00:00Z', updatedAt: '2026-10-16T00:00:00Z',
} satisfies CatalogSkin
const old = { ...target, id: 'old.skin', package: 'old-skin', rowId: 'ui-old-skin', name: { zh: '原皮肤', en: 'Old Skin' } }
const runtime = { version: '0.2.0-rc.2', capabilities: [], source: 'injected' as const }
const management = { official: true, capabilities: { install: { available: true }, update: { available: true }, enable: { available: true }, disable: { available: true }, remove: { available: true } } }
const artifactRisk = { context: 'new-artifact-context', packageName: target.package, version: target.install.version, warnings: ['安装包未通过市场核验'] }
type SelectionPlan = { status: 'repairable' | 'blocked' | 'none'; context?: string; changes: Array<ConfigurationOverridePlan & { skinId: string }>; reason: string }

function change(skin: CatalogSkin, desiredEnabled = true): ConfigurationOverridePlan & { skinId: string } {
  return { status: 'repairable', context: 'c'.repeat(64), source: 'home', file: '/Users/example/.dsh/cordis.patch.yml', skinId: skin.id, rowId: skin.rowId,
    previousDisabled: desiredEnabled, desiredEnabled, sharedAcrossProfiles: true, reason: '可移除静态覆盖。' }
}
function repairPlan(changes = [change(target)], context = 'a'.repeat(64)): SelectionPlan {
  return { status: 'repairable', context, changes, reason: '继续前需审核共享覆盖。' }
}

function market(options: { skin?: CatalogSkin; oldSkin?: CatalogSkin; extraSkins?: CatalogSkin[]; pinnedSkinIds?: string[]; plan?: SelectionPlan; risk?: RuntimeSkin['artifactRisk']; official?: boolean; selectionPlanAvailable?: boolean; networkRetry?: boolean; configurationFailure?: boolean; active?: boolean; kind?: 'activate' | 'pin' | 'deactivate'; failRecheck?: 'network' | 'server'; holdInitial?: boolean; holdRecheck?: boolean; selectionContext?: string } = {}) {
  const skin = options.skin ?? target
  const existing = options.oldSkin ?? old
  const extraSkins = options.extraSkins ?? []
  const state = { plan: options.plan ?? repairPlan(), used: options.active ?? false, risk: options.risk, retried: false, catalogSkin: skin as CatalogSkin }
  let selectionRequests = 0
  let releaseInitial: (() => void) | undefined
  let releaseRecheck: (() => void) | undefined
  const pendingInitial = options.holdInitial ? new Promise<void>(resolve => { releaseInitial = resolve }) : undefined
  const pendingRecheck = options.holdRecheck ? new Promise<void>(resolve => { releaseRecheck = resolve }) : undefined
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [state.catalogSkin, existing, ...extraSkins] }) }
    if (url.endsWith('/state')) return { ok: true, json: async () => ({ hostKind: 'desktop', runtime, selectionPlanAvailable: options.selectionPlanAvailable !== false,
      ...(options.official === false ? {} : { management }), skins: [
        { skinId: skin.id, installation: 'installed', activation: state.used ? 'active' : 'inactive', primary: state.used, installedVersion: skin.install.version, updateAvailable: false, ...(state.risk !== undefined && { artifactRisk: state.risk }) },
          { skinId: existing.id, installation: 'installed', activation: state.used ? 'inactive' : 'active', primary: !state.used, installedVersion: existing.install.version, updateAvailable: false },
        ...extraSkins.map(item => ({ skinId: item.id, installation: 'installed' as const, activation: 'active' as const, primary: false, pinned: options.pinnedSkinIds?.includes(item.id) === true, installedVersion: item.install.version, updateAvailable: false })),
      ] }) }
    if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ updateAvailable: false }) }
    if (url.endsWith('/selection-plan') && init?.method === 'POST') {
      expect(JSON.parse(String(init.body))).toEqual(expect.objectContaining({ skinId: skin.id, kind: options.kind ?? 'activate' }))
      selectionRequests += 1
      if (selectionRequests === 1 && pendingInitial !== undefined) await pendingInitial
      if (selectionRequests === 2) {
        if (options.failRecheck === 'network') throw new Error('network unavailable during shared configuration check')
        if (options.failRecheck === 'server') return { ok: false, status: 503, json: async () => ({ error: '共享配置检查暂不可用' }) }
        if (pendingRecheck !== undefined) await pendingRecheck
      }
      return { ok: true, json: async () => ({ ...state.plan, ...(options.selectionContext === undefined ? {} : { selectionContext: options.selectionContext }) }) }
    }
    if (/\/(?:activate|pin|deactivate)$/.test(url) && init?.method === 'POST') {
      if (options.configurationFailure) state.risk = artifactRisk
      if (!options.networkRetry && !options.configurationFailure) state.used = !url.endsWith('/deactivate')
      return { ok: true, json: async () => ({ operationId: 'selection-use' }) }
    }
    if (url.endsWith('/operations/selection-use')) return { ok: true, json: async () => options.configurationFailure
      ? { id: 'selection-use', kind: 'activate', skinId: skin.id, phase: 'failed', application: 'overridden', startedAt: '2026-10-16T00:00:00Z', failure: {
        kind: 'configuration-override', message: 'old skin forced enabled', action: 'repair-configuration', desiredEnabled: false, targetSkinId: old.id, configurationOverride: change(old, false),
      } }
      : options.networkRetry
      ? { id: 'selection-use', kind: 'activate', skinId: skin.id, phase: 'failed', startedAt: '2026-10-16T00:00:00Z', failure: { kind: 'network', message: 'temporary network error', action: 'retry' } }
      : { id: 'selection-use', kind: options.kind ?? 'activate', skinId: skin.id, phase: 'done' } }
    if (url.endsWith('/operations/selection-use/retry') && init?.method === 'POST') {
      state.retried = true
      state.used = true
      return { ok: true, json: async () => ({ operationId: 'selection-retried' }) }
    }
    if (url.endsWith('/operations/selection-retried')) return { ok: true, json: async () => ({ id: 'selection-retried', kind: 'activate', skinId: skin.id, phase: 'done' }) }
    if (url.includes('media-manifest')) return { ok: false, status: 404 }
    throw new Error(`Unexpected request: ${url} ${init?.method ?? 'GET'}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  const rendered = render(<SkinMarketSection t={key => key} />)
  const posts = (suffix?: string) => fetchMock.mock.calls.filter(([url, init]) => init?.method === 'POST' && (suffix === undefined ? !url.endsWith('/selection-plan') : url.endsWith(suffix)))
  return { state, fetchMock, posts, releaseInitial: () => releaseInitial?.(), releaseRecheck: () => releaseRecheck?.(), ...rendered }
}

async function choose(kind: 'activate' | 'pin' | 'deactivate' = 'activate') {
  const card = await screen.findByRole('button', { name: '新皮肤 已安装卡片' })
  if (kind === 'pin') {
    fireEvent.click(card)
    fireEvent.click(screen.getByRole('button', { name: '设为常驻' }))
  } else fireEvent.click(within(card.closest('article')!).getByRole('button', { name: kind === 'activate' ? '使用' : '停用' }))
}

beforeEach(() => { shownDialogs.length = 0; window.localStorage.setItem('dsh-skin-market:activation-warning-accepted', 'true') })
afterEach(() => { cleanup(); setGeneratedMediaSources(undefined); window.localStorage.clear(); window.sessionStorage.clear(); vi.unstubAllGlobals() })

describe('combined selection confirmation', () => {
  it('shows cross-category conflicts in one dialog and sends the selected retained skins once', async () => {
    const pet = { ...target, category: 'pet' }
    const app = market({ skin: pet })
    await choose()
    const dialog = await screen.findByRole('dialog', { name: '使用前确认' })
    expect(dialog.textContent).toContain(old.name.zh)
    expect(within(dialog).getAllByRole('switch')).toHaveLength(1)
    expect(within(dialog).getByRole('switch').getAttribute('aria-checked')).toBe('true')
    expect(within(dialog).getByRole('button', { name: '保留1 个插件，继续使用' })).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '保留1 个插件，继续使用' }))
    await waitFor(() => expect(app.posts('/activate')).toHaveLength(1))
    expect(JSON.parse(String(app.posts('/activate')[0]![1]!.body)).preservedSkinIds).toEqual([old.id])
  })

  it('keeps an unlisted same-category pinned skin when closing all displayed conflicts', async () => {
    const pet = { ...target, category: 'pet' }
    const sameCategoryPinned = { ...pet, id: 'pinned.pet', package: 'pinned-pet', rowId: 'ui-pinned-pet', name: { zh: '已常驻宠物', en: 'Pinned Pet' } }
    const app = market({ skin: pet, extraSkins: [sameCategoryPinned], pinnedSkinIds: [sameCategoryPinned.id] })
    await choose()
    const dialog = await screen.findByRole('dialog', { name: '使用前确认' })
    fireEvent.click(within(dialog).getByRole('button', { name: '全部关闭并继续' }))
    await waitFor(() => expect(app.posts('/activate')).toHaveLength(1))
    expect(JSON.parse(String(app.posts('/activate')[0]![1]!.body)).preservedSkinIds).toEqual([sameCategoryPinned.id])
  })

  it('shows and submits compatibility approval for a secondary skin retained in this activation', async () => {
    const pet = { ...target, category: 'pet' }
    const incompatibleExisting = { ...old, compatibility: { ...old.compatibility, dsh: '<0.1.0-rc.1' } }
    const app = market({ skin: pet, oldSkin: incompatibleExisting, selectionContext: 'c'.repeat(64) })
    await choose()
    const dialog = await screen.findByRole('dialog', { name: '使用前确认' })
    expect(dialog.textContent).toContain('兼容性未确认')
    fireEvent.click(within(dialog).getByRole('button', { name: /保留1 个插件，继续使用/ }))
    await waitFor(() => expect(app.posts('/activate')).toHaveLength(1))
    const body = JSON.parse(String(app.posts('/activate')[0]![1]!.body))
    expect(body.preservedSkinIds).toEqual([incompatibleExisting.id])
    expect(body.preservedSkinApprovals[incompatibleExisting.id].compatibilityContext).toBe(compatibilityContext(incompatibleExisting, runtime))
    expect(body.selectionContext).toBe('c'.repeat(64))
    const selectionPlans = app.fetchMock.mock.calls.filter(([url, init]) => url.endsWith('/selection-plan') && init?.method === 'POST')
    expect(JSON.parse(String(selectionPlans.at(-1)![1]!.body)).preservedSkinIds).toEqual([incompatibleExisting.id])
  })

  it('refreshes the same confirmation when the active selection changes while it is open', async () => {
    const pet = { ...target, category: 'pet' }
    const app = market({ skin: pet })
    await choose()
    const dialog = await screen.findByRole('dialog', { name: '使用前确认' })
    const stateRequestsBefore = app.fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length
    app.state.used = true
    fireEvent.focus(window)
    await waitFor(() => expect(app.fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(stateRequestsBefore))
    fireEvent.click(within(dialog).getByRole('button', { name: /保留1 个插件，继续使用/ }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: '使用前确认' }).textContent).toContain('已变化'))
    expect(app.posts('/activate')).toHaveLength(0)
    expect(dialog).toBe(screen.getByRole('dialog', { name: '使用前确认' }))
  })

  it('combines incompatibility, first-use, artifact risk and shared repair before the first activation', async () => {
    window.localStorage.removeItem('dsh-skin-market:activation-warning-accepted')
    const incompatible = { ...target, compatibility: { ...target.compatibility, dsh: '<0.2.0-rc.2' } }
    const app = market({ skin: incompatible, risk: artifactRisk })
    await choose()
    const dialog = await screen.findByRole('dialog', { name: '使用前确认' })
    for (const text of ['不在作者声明的兼容范围', '安装包文件尚未验证', '停用其他未设为常驻的皮肤', target.rowId, '备份']) expect(dialog.textContent).toContain(text)
    expect(app.posts()).toHaveLength(0)
    expect(app.posts('/selection-plan').length).toBeGreaterThan(0)
    fireEvent.click(within(dialog).getByRole('button', { name: '解除覆盖并继续' }))
    await waitFor(() => expect(app.posts('/activate')).toHaveLength(1))
    expect(JSON.parse(String(app.posts('/activate')[0]![1]!.body))).toEqual({ skinId: target.id, configurationContext: app.state.plan.context,
      acknowledgeCompatibility: true, compatibilityContext: compatibilityContext(incompatible, runtime), artifactContext: artifactRisk.context })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '使用前确认' })).toBeNull())
    expect(shownDialogs).not.toContain('启用未完成')
    expect(shownDialogs).not.toContain('启用需要确认安装包风险')
    expect(app.posts()).toHaveLength(1)
  })

  it.each(['activate', 'pin', 'deactivate'] as const)('uses one repair confirmation for compatible %s even without other warnings', async kind => {
    const app = market({ kind, active: kind === 'deactivate', plan: repairPlan([change(target, kind !== 'deactivate')]) })
    await choose(kind)
    const dialog = await screen.findByRole('dialog', { name: kind === 'deactivate' ? '操作前确认' : '使用前确认' })
    expect(dialog.textContent).toContain(target.rowId)
    expect(dialog.textContent).not.toContain('安装包未通过市场核验')
    expect(dialog.textContent).not.toContain('不在作者声明的兼容范围')
    fireEvent.click(within(dialog).getByRole('button', { name: '解除覆盖并继续' }))
    await waitFor(() => expect(app.posts(`/${kind}`)).toHaveLength(1))
    expect(JSON.parse(String(app.posts(`/${kind}`)[0]![1]!.body))).toEqual(expect.objectContaining({ skinId: target.id, configurationContext: app.state.plan.context }))
    expect(shownDialogs).not.toContain(`${kind === 'deactivate' ? '停用' : kind === 'pin' ? '设置常驻' : '启用'}未完成`)
  })

  it('cancels the combined confirmation without changing configuration or starting activation', async () => {
    const app = market()
    await choose()
    const dialog = await screen.findByRole('dialog', { name: '使用前确认' })
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog', { name: '使用前确认' })).toBeNull()
    expect(app.posts('/selection-plan').length).toBeGreaterThan(0)
    expect(app.posts()).toHaveLength(0)
  })

  it('starts one preflight and one activation when use and approval are clicked repeatedly', async () => {
    const app = market({ holdInitial: true })
    const card = await screen.findByRole('button', { name: '新皮肤 已安装卡片' })
    const use = within(card.closest('article')!).getByRole('button', { name: '使用' })
    fireEvent.click(use)
    fireEvent.click(use)
    await waitFor(() => expect(app.posts('/selection-plan')).toHaveLength(1))
    expect(app.posts()).toHaveLength(0)
    await act(async () => { app.releaseInitial() })
    const dialog = await screen.findByRole('dialog', { name: '使用前确认' })
    const approve = within(dialog).getByRole('button', { name: '解除覆盖并继续' })
    fireEvent.click(approve)
    fireEvent.click(approve)
    await waitFor(() => expect(app.posts('/activate')).toHaveLength(1))
    expect(app.posts()).toHaveLength(1)
    expect(app.posts('/selection-plan')).toHaveLength(2)
  })

  it('shows old forced-enabled and new forced-disabled identities while attaching use risk to the new skin', async () => {
    const incompatible = { ...target, compatibility: { ...target.compatibility, dsh: '<0.2.0-rc.2' } }
    const app = market({ skin: incompatible, risk: artifactRisk, plan: repairPlan([change(old, false), change(target, true)]) })
    await choose()
    const dialog = await screen.findByRole('dialog', { name: '使用前确认' })
    expect(dialog.textContent).toContain(`${target.name.zh}（版本 ${target.install.version}）`)
    expect(dialog.textContent).not.toContain(`${old.name.zh}（版本 ${old.install.version}）`)
    for (const text of [old.name.zh, old.rowId, target.name.zh, target.rowId, 'disabled: false', 'disabled: true', '安装包文件尚未验证']) expect(dialog.textContent).toContain(text)
    expect(screen.getAllByRole('dialog').filter(item => item.className.includes('warningModal'))).toHaveLength(1)
    expect(app.posts()).toHaveLength(0)
  })

  it('refreshes a changed configuration plan in the same dialog and requires a second explicit approval', async () => {
    const app = market()
    await choose()
    const dialog = await screen.findByRole('dialog', { name: '使用前确认' })
    app.state.plan = repairPlan([change(target)], 'b'.repeat(64))
    fireEvent.focus(window)
    fireEvent.click(within(dialog).getByRole('button', { name: '解除覆盖并继续' }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: '使用前确认' }).textContent).toMatch(/变化|变更|重新确认/))
    const refreshed = screen.getByRole('dialog', { name: '使用前确认' })
    expect(screen.getAllByRole('dialog').filter(item => item.className.includes('warningModal'))).toHaveLength(1)
    expect(app.posts()).toHaveLength(0)
    fireEvent.click(within(refreshed).getByRole('button', { name: '解除覆盖并继续' }))
    await waitFor(() => expect(app.posts('/activate')).toHaveLength(1))
    expect(JSON.parse(String(app.posts('/activate')[0]![1]!.body)).configurationContext).toBe('b'.repeat(64))
  })

  it.each(['network', 'server'] as const)('does not turn an approved repair into no repair when its final %s recheck fails', async failRecheck => {
    const app = market({ failRecheck })
    await choose()
    const dialog = await screen.findByRole('dialog', { name: '使用前确认' })
    fireEvent.click(within(dialog).getByRole('button', { name: '解除覆盖并继续' }))
    const error = await screen.findByRole('alert')
    expect(error.textContent?.trim()).toBeTruthy()
    expect(app.posts('/selection-plan')).toHaveLength(2)
    expect(app.posts()).toHaveLength(0)
    expect(app.posts('/activate')).toHaveLength(0)
  })

  it('requires new consent when the catalog changes while the final shared-configuration check is pending', async () => {
    const app = market({ holdRecheck: true })
    await choose()
    fireEvent.click(within(await screen.findByRole('dialog', { name: '使用前确认' })).getByRole('button', { name: '解除覆盖并继续' }))
    await waitFor(() => expect(app.posts('/selection-plan')).toHaveLength(2))
    const updated = { ...target, name: { zh: '新皮肤新版', en: 'New Skin Updated' }, install: { ...target.install, version: '1.1.0', commit: 'd'.repeat(40) } }
    app.state.catalogSkin = updated
    fireEvent.focus(window)
    await screen.findByRole('button', { name: '新皮肤新版 已安装卡片' })
    await act(async () => { app.releaseRecheck() })
    const refreshed = await screen.findByRole('dialog', { name: '使用前确认' })
    expect(refreshed.textContent).toContain('新皮肤新版（版本 1.1.0）')
    expect(refreshed.textContent).toMatch(/变化|变更|重新确认/)
    expect(app.posts()).toHaveLength(0)
    fireEvent.click(within(refreshed).getByRole('button', { name: '解除覆盖并继续' }))
    await waitFor(() => expect(app.posts('/activate')).toHaveLength(1))
    expect(JSON.parse(String(app.posts('/activate')[0]![1]!.body)).compatibilityContext).toBe(compatibilityContext(updated, runtime))
  })

  it('retries an already accepted unchanged artifact without showing another use confirmation', async () => {
    const app = market({ risk: artifactRisk, networkRetry: true, plan: { status: 'none', changes: [], reason: '' } })
    await choose()
    const use = await screen.findByRole('dialog', { name: '使用前确认' })
    fireEvent.click(within(use).getByRole('button', { name: '仍然使用' }))
    const failure = await screen.findByRole('dialog', { name: '启用未完成' })
    shownDialogs.length = 0
    fireEvent.click(within(failure).getByRole('button', { name: '重试' }))
    await waitFor(() => expect(app.posts('/operations/selection-use/retry')).toHaveLength(1))
    expect(JSON.parse(String(app.posts('/operations/selection-use/retry')[0]![1]!.body))).toEqual(expect.objectContaining({
      action: 'retry', acknowledgeCompatibility: true, compatibilityContext: compatibilityContext(target, runtime), artifactContext: artifactRisk.context,
    }))
    expect(shownDialogs).not.toContain('使用前确认')
    expect(screen.queryByRole('dialog', { name: '使用前确认' })).toBeNull()
  })

  it('merges requested-skin risk with a late old-skin repair failure and retries directly from that confirmation', async () => {
    const app = market({ configurationFailure: true, plan: { status: 'none', changes: [], reason: '' } })
    await choose()
    const dialog = await screen.findByRole('dialog', { name: '启用未完成' })
    await waitFor(() => expect(dialog.textContent).toContain('安装包文件尚未验证'))
    expect(dialog.textContent).toContain('「原皮肤」被其他设置强制启用')
    expect(dialog.textContent).toContain(`${target.name.zh}（版本 ${target.install.version}）`)
    expect(dialog.textContent).toContain(old.rowId)
    expect(app.posts()).toHaveLength(1)
    shownDialogs.length = 0
    fireEvent.click(within(dialog).getByRole('button', { name: '解除覆盖并继续' }))
    await waitFor(() => expect(app.posts('/operations/selection-use/retry')).toHaveLength(1))
    expect(JSON.parse(String(app.posts('/operations/selection-use/retry')[0]![1]!.body))).toEqual({
      action: 'repair-configuration', configurationContext: 'c'.repeat(64), acknowledgeCompatibility: true,
      compatibilityContext: compatibilityContext(target, runtime), artifactContext: artifactRisk.context,
    })
    expect(shownDialogs).not.toContain('使用前确认')
    expect(app.posts('/activate')).toHaveLength(1)
    expect(app.posts()).toHaveLength(2)
  })

  it('does not request an official selection plan for a host without official management', async () => {
    const app = market({ official: false })
    await choose()
    await waitFor(() => expect(app.posts('/activate')).toHaveLength(1))
    expect(app.posts('/selection-plan')).toHaveLength(0)
  })

  it('retains ordinary activation for an older official host that does not advertise selection preflight', async () => {
    const app = market({ selectionPlanAvailable: false })
    await choose()
    await waitFor(() => expect(app.posts('/activate')).toHaveLength(1))
    expect(app.posts('/selection-plan')).toHaveLength(0)
  })
})
