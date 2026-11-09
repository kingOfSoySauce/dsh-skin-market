import { cleanup, fireEvent, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, vi } from 'vitest'
import { messageCatalog } from '../../src/client/i18n.ts'
import { setGeneratedMediaSources } from '../../src/media-preview.ts'
import type { CatalogSkin, Operation } from '../../src/client/types.ts'

/** Product copy from the same catalog the section renders; rewording must not break behavior tests. */
export const zh = messageCatalog.zh

export const skin = {
  id: 'test.skin', name: { zh: '测试皮肤', en: 'Test Skin' }, author: 'author', description: 'description', repo: 'https://github.com/a/b', package: 'skin', rowId: 'skin',
  tags: ['dark'], modes: ['dark'], install: { target: 'https://github.com/a/b.git#aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', version: '1.0.0', commit: 'a'.repeat(40) }, compatibility: { dsh: '0.1.0-rc.6', platform: ['web'] },
  screenshots: ['https://example.com/preview.png'], license: { code: 'MIT', commercialUse: true }, githubStars: 42, starsStale: false, starsUpdatedAt: '2026-08-16T00:00:00Z', recommendations: [], releaseUpdatedAt: '2026-08-16T00:00:00Z', metadataUpdatedAt: '2026-08-16T00:00:00Z', updatedAt: '2026-08-16T00:00:00Z',
} satisfies CatalogSkin

export const dshRuntime = { version: '0.1.0-rc.6', capabilities: [], source: 'injected' as const }

export const managedDesktopSkin = {
  ...skin,
  compatibility: { dsh: '>=0.1.0-rc.6', platform: ['web', 'desktop'] },
  install: { ...skin.install, desktop: { mode: 'managed', registry: 'npm', packageName: skin.package, packageVersion: skin.install.version } },
} satisfies CatalogSkin

export const officialManagement = {
  official: true,
  capabilities: { install: { available: true }, update: { available: true }, enable: { available: true }, disable: { available: true }, remove: { available: true } },
}

export function artifactRiskOperation(id = 'install-artifact-risk'): Operation {
  return {
    id, kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(),
    failure: {
      kind: 'integrity', message: 'npm 包完整性与已核验的 SRI 不一致', action: 'approve-artifact',
      artifactRisk: { context: 'actual-artifact-context', packageName: skin.package, version: skin.install.version, warnings: ['npm 包完整性与已核验的 SRI 不一致'] },
    },
  }
}

/** Register the DOM lifecycle every client-market spec relies on. */
export function registerMarketTestDom(): void {
  beforeEach(() => { window.localStorage.setItem('dsh-skin-market:activation-warning-accepted', 'true') })
  afterEach(() => {
    cleanup()
    setGeneratedMediaSources(undefined)
    window.localStorage.clear()
    window.sessionStorage.clear()
    // A failed test must not leak its fetch clipboard, URL or injected style into the next one.
    Reflect.deleteProperty(navigator, 'clipboard')
    window.history.replaceState(null, '', '/')
    document.head.querySelector('style[data-dsh-skin-market-wide]')?.remove()
    vi.unstubAllGlobals()
  })
}

export async function openSkinCard(name: RegExp = /测试皮肤 界面预览/) {
  const card = await screen.findByRole('button', { name })
  fireEvent.click(card)
  return card
}

export function visibleWarningDialogs(): HTMLElement[] {
  return screen.queryAllByRole('dialog').filter(dialog => dialog.className.includes('warningModal'))
}

/**
 * Stand-in for the design-system primitives. Tests assert the props the
 * section passes and the rendered structure, not the package's own styling.
 */
export function createPrimitivesMock() {
  const icon = () => React.createElement('span', { 'aria-hidden': true })
  const copyIcon = () => React.createElement('span', { 'aria-hidden': true, 'data-icon': 'copy' })
  const checkIcon = () => React.createElement('span', { 'aria-hidden': true, 'data-icon': 'check' })
  return {
    Button: ({ icon: leading, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }) => React.createElement('button', props, leading, children),
    Input: ({ icon: leading, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode }) => React.createElement('label', null, leading, React.createElement('input', props)),
    Pill: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => React.createElement('button', props, children),
    Switch: ({ checked, onChange, label, ...props }: { checked: boolean; onChange: (next: boolean) => void; label: string; className?: string }) => React.createElement('button', { ...props, type: 'button', role: 'switch', 'aria-checked': checked, 'aria-label': label, onClick: () => onChange(!checked) }),
    Modal: ({
      open,
      title,
      closeLabel = '关闭',
      onClose,
      description,
      footer,
      className,
      children,
    }: {
      open: boolean
      title: string
      closeLabel?: string
      onClose?: () => void
      description?: string
      footer?: React.ReactNode
      className?: string
      children?: React.ReactNode
    }) => open ? React.createElement(
      'div',
      { role: 'dialog', 'aria-label': title, className },
      React.createElement('h2', null, title),
      React.createElement('button', { type: 'button', 'aria-label': closeLabel, onClick: onClose }),
      description,
      children,
      footer,
    ) : null,
    DisclosureRow: ({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children?: React.ReactNode }) => React.createElement('div', null, React.createElement('button', { type: 'button', 'aria-expanded': open, onClick: onToggle }, title), open ? children : null),
    CodeBlock: ({ code, copyLabel }: { code: string; copyLabel?: string }) => React.createElement('pre', null, code, React.createElement('button', { type: 'button' }, copyLabel)),
    IconChevronLeftOutline14: icon, IconChevronDownOutline14: icon, IconCloseOutline16: icon, IconCopyOutline16: copyIcon, IconCheckOutline16: checkIcon, IconDownloadOutline16: icon, IconLinkOutline16: icon, IconLoadingOutline16: icon,
    IconRefreshOutline16: icon, IconSearchOutline16: icon, IconTrashOutline16: icon,
    IconChevronLeftOutlineRegular: icon, IconChevronDownOutlineRegular: icon, IconCloseOutlineRegular: icon, IconCopyOutlineRegular: copyIcon, IconCheckOutlineRegular: checkIcon, IconDownloadOutlineRegular: icon, IconLoadingOutlineRegular: icon,
    IconRefreshOutlineRegular: icon, IconSearchOutlineRegular: icon, IconTrashOutlineRegular: icon,
    writeClipboard: async (text: string) => {
      if (navigator.clipboard?.writeText === undefined) return false
      await navigator.clipboard.writeText(text)
      return true
    },
  }
}
