import { createElement as h } from 'react'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import { SkinMarketSection } from './SkinMarketSection.tsx'
import { createDesktopPluginPanel } from './desktop-plugin-panel.ts'
import { createTranslator, hostDictionaries, type MessageKey, type Translator } from './i18n.ts'

const namespace = 'dsh-skin-market'

interface ClientContext {
  get?: (name: string) => unknown
  on?: (event: 'internal/status', listener: () => void) => () => void
  effect(callback: () => unknown, label?: string): void
  locale: {
    register(namespace: string, dictionaries: Record<string, Record<string, string>>): unknown
    bind(namespace: string): (key: string) => string
    getSnapshot?: () => { active?: string }
  }
  loader: ClientLoader
  slots: { inject(slot: string, callback: () => unknown): void; register(meta: Record<string, unknown>, component: () => unknown): unknown; entriesOfSlot?: (slot: string) => readonly unknown[] }
  layout?: { selectPanel(panelId: string): void }
}

interface ClientLoaderEntry {
  options: { name: string; disabled?: boolean | null }
  disabled?: boolean | null
  fiber?: { state?: number }
  update(options: { disabled: boolean | null }, create?: boolean, force?: boolean): Promise<void>
}

interface ClientLoader { entries(): Iterable<ClientLoaderEntry> }

export interface ClientSkinRuntime {
  /** Returns whether the loader accepted the request; probeActive confirms its outcome. */
  setActive(packageName: string, active: boolean): Promise<boolean>
  probeActive?(packageName: string): ClientSkinActivity
  /** False only after the browser module graph has finished unloading old entries. */
  probeSyncing?(): boolean | undefined
  observe?(listener: () => void): () => void
}

export type ClientSkinActivity = 'active' | 'loading' | 'pending' | 'failed' | 'missing' | 'disabled' | 'unknown'

export interface ClientSkinExpectation { package: string; active: boolean }

export interface ClientSkinSelectionStatus {
  status: 'applied' | 'switching' | 'restart-required' | 'unavailable'
  package?: string
  activity?: ClientSkinActivity
}

/** Check the whole browser selection, including preserved plugins and retired skins. */
export function probeClientSkinSelection(runtime: ClientSkinRuntime, expected: readonly ClientSkinExpectation[]): ClientSkinSelectionStatus {
  const targets = new Map<string, boolean>()
  for (const target of expected) {
    if (targets.has(target.package) && targets.get(target.package) !== target.active) return { status: 'unavailable', package: target.package, activity: 'unknown' }
    targets.set(target.package, target.active)
  }
  let syncing: boolean | undefined
  try { syncing = runtime.probeSyncing?.() } catch { /* An older host cannot confirm graph settlement. */ }
  if (syncing === true) return { status: 'switching', activity: 'loading' }
  const unresolved = [...targets].flatMap(([packageName, active]) => {
    let activity: ClientSkinActivity
    try { activity = runtime.probeActive?.(packageName) ?? 'unknown' } catch { activity = 'unknown' }
    if (active ? activity === 'active' : activity === 'disabled' || activity === 'missing') {
      // Entries leave the roster before their fibers finish disposing. Only
      // the graph's settled snapshot confirms that an absent old skin is gone.
      if (!active && syncing !== false) return [{ package: packageName, activity: 'unknown' as const }]
      return []
    }
    return [{ package: packageName, activity }]
  })
  const unavailable = unresolved.find(item => item.activity === 'failed' || item.activity === 'unknown')
  if (unavailable !== undefined) return { status: 'unavailable', ...unavailable }
  const switching = unresolved.find(item => item.activity === 'loading' || item.activity === 'pending')
  if (switching !== undefined) return { status: 'switching', ...switching }
  const pending = unresolved[0]
  return pending === undefined ? { status: 'applied' } : { status: 'restart-required', ...pending }
}

export async function switchClientSkin(runtime: ClientSkinRuntime, packageNames: string[], target: string, preserved: Iterable<string> = []): Promise<boolean> {
  const keep = new Set([...preserved, target])
  for (const packageName of packageNames) {
    if (!keep.has(packageName)) await runtime.setActive(packageName, false)
  }
  return runtime.setActive(target, true)
}

interface ClientModuleSnapshot { syncing?: boolean }
interface ClientModuleStore {
  getSnapshot?(): ClientModuleSnapshot
  subscribe?(listener: () => void): () => void
}

export function createClientSkinRuntime(loader: ClientLoader, events?: Pick<ClientContext, 'on' | 'get'>): ClientSkinRuntime {
  const moduleStore = (): ClientModuleStore | undefined => {
    try { return (events?.get?.('modules') as { entries?: { state?: ClientModuleStore } } | undefined)?.entries?.state } catch { return undefined }
  }
  return {
    probeSyncing() {
      try {
        const syncing = moduleStore()?.getSnapshot?.().syncing
        return typeof syncing === 'boolean' ? syncing : undefined
      } catch { return undefined }
    },
    observe(listener) {
      let active = true
      const disposers: Array<() => void> = []
      const notify = () => {
        if (!active) return
        try { listener() } catch { /* A stale view must not break a fiber transition. */ }
      }
      try {
        // Cordis owns this listener with the market plugin's context; the view
        // also releases it on unmount. No loader entry is changed here.
        const dispose = events?.on?.('internal/status', notify)
        if (typeof dispose === 'function') disposers.push(dispose)
      } catch { /* Some old contexts cannot observe fiber status. */ }
      try {
        const dispose = moduleStore()?.subscribe?.(notify)
        if (typeof dispose === 'function') disposers.push(dispose)
      } catch { /* The fiber observer still works without the module store. */ }
      return () => {
        if (!active) return
        active = false
        for (const dispose of disposers) dispose()
      }
    },
    probeActive(packageName) {
      try {
        // The browser module graph emits its package name as manifest row id;
        // this differs from the host's cordis.patch.yml plugin row id.
        const matches = [...loader.entries()].filter(item => item.options.name === packageName)
        if (matches.length === 0) return 'missing'
        if (matches.length !== 1) return 'unknown'
        const entry = matches[0]!
        if (entry.fiber?.state === 5) return 'loading'
        if (entry.disabled === true || entry.options.disabled === true) {
          if (entry.fiber?.state === 0) return 'pending'
          if (entry.fiber?.state === 1 || entry.fiber?.state === 2) return 'loading'
          if (entry.fiber?.state === 3) return 'failed'
          return entry.fiber?.state === undefined || entry.fiber.state === 4 ? 'disabled' : 'unknown'
        }
        // Mirror the pinned Cordis const enum, which has no runtime object.
        switch (entry.fiber?.state) {
          case 0: return 'pending'
          case 1: return 'loading'
          case 2: return 'active'
          case 3: return 'failed'
          default: return 'unknown'
        }
      } catch { return 'unknown' }
    },
    async setActive(packageName, active) {
      const entry = [...loader.entries()].find(item => item.options.name === packageName)
      if (entry === undefined) return false
      await entry.update({ disabled: active ? null : true }, false, true)
      return true
    },
  }
}

export const name = 'dsh-skin-market'
export const inject = ['slots', 'locale', 'loader']
export const REQUIRED_PRIMITIVES = ['Button', 'Input', 'Modal', 'Pill', 'Switch'] as const

export function missingPrimitives(module: Record<string, unknown>): string[] {
  return REQUIRED_PRIMITIVES.filter(key => module[key] === undefined)
}

export function apply(ctx: ClientContext): void {
  const missing = missingPrimitives(primitives as unknown as Record<string, unknown>)
  if (missing.length > 0) {
    console.warn(`[dsh-skin-market] missing DSH primitives: ${missing.join(', ')}`)
    return
  }
  ctx.effect(() => ctx.locale.register(namespace, hostDictionaries), 'dsh-skin-market: locale')
  const hostLocale = () => {
    try {
      const active = ctx.locale.getSnapshot?.().active?.toLowerCase()
      return active?.startsWith('en') === true ? 'en' : 'zh'
    } catch {
      return 'zh'
    }
  }
  const t: Translator = createTranslator(ctx.locale.bind(namespace), 'zh', hostLocale)
  const hostT = (key: string): string => t(key as MessageKey)
  const clientRuntime = createClientSkinRuntime(ctx.loader, ctx)
  const desktopPluginPanel = createDesktopPluginPanel(ctx)
  ctx.effect(() => () => desktopPluginPanel.dispose?.(), 'dsh-skin-market: native install tracking')
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'skin-market', order: 45, label: () => t('nav.market'), locale: namespace, inject: () => ({ t: hostT }),
  }, () => h(SkinMarketSection, { t, clientRuntime, desktopPluginPanel, layout: 'fill' })))
  // The injection stays dormant on older hosts and registers when the new
  // Plugins page owns this slot. Both entry points use the same market UI.
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config', key: namespace, locale: namespace, inject: () => ({ t: hostT }),
  }, () => h(SkinMarketSection, { t, clientRuntime, desktopPluginPanel, layout: 'embedded' })))
}

export { SkinMarketSection } from './SkinMarketSection.tsx'
