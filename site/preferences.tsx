import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_SITE_LANGUAGE, SITE_LANGUAGES, translate, type MessageKey, type MessageParamsFor, type SiteLanguage, type SiteTranslator } from './messages.ts'

export type SiteTheme = 'auto' | 'light' | 'dark'
export const SITE_THEMES = ['auto', 'light', 'dark'] as const

export const LANGUAGE_STORAGE_KEY = 'dsh-skin-market:language'
export const THEME_STORAGE_KEY = 'dsh-skin-market:theme'
const DARK_MODE_QUERY = '(prefers-color-scheme: dark)'

export interface SitePreferences {
  language: SiteLanguage
  theme: SiteTheme
  resolvedTheme: Exclude<SiteTheme, 'auto'>
  t: SiteTranslator
  setLanguage: (language: SiteLanguage) => void
  setTheme: (theme: SiteTheme) => void
}

export interface SitePreferencesProviderProps {
  children: ReactNode
  initialLanguage?: SiteLanguage
  initialTheme?: SiteTheme
  storage?: Storage
}

function isSiteLanguage(value: string | null): value is SiteLanguage {
  return value !== null && (SITE_LANGUAGES as readonly string[]).includes(value)
}

function isSiteTheme(value: string | null): value is SiteTheme {
  return value !== null && (SITE_THEMES as readonly string[]).includes(value)
}

export function resolveBrowserLanguage(languages: readonly string[] | undefined, fallback: SiteLanguage = DEFAULT_SITE_LANGUAGE): SiteLanguage {
  for (const language of languages ?? []) {
    const normalized = language.trim().toLowerCase()
    if (normalized === 'zh' || normalized.startsWith('zh-')) return 'zh'
    if (normalized === 'en' || normalized.startsWith('en-')) return 'en'
  }
  return fallback
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return []
  return navigator.languages?.length > 0 ? navigator.languages : [navigator.language]
}

function readStorage(storage: Storage | undefined, key: string): string | null {
  try {
    if (storage !== undefined) return storage.getItem(key)
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(storage: Storage | undefined, key: string, value: string): void {
  try {
    if (storage !== undefined) storage.setItem(key, value)
    else if (typeof window !== 'undefined') window.localStorage.setItem(key, value)
  } catch {
    // Preferences are optional; a blocked storage implementation should not break the site.
  }
}

function removeStorage(storage: Storage | undefined, key: string): void {
  try {
    if (storage !== undefined) storage.removeItem(key)
    else if (typeof window !== 'undefined') window.localStorage.removeItem(key)
  } catch {
    // Preferences are optional; a blocked storage implementation should not break the site.
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(DARK_MODE_QUERY).matches
    : false
}

function subscribeToMediaQuery(query: MediaQueryList, listener: (event: MediaQueryListEvent) => void): () => void {
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', listener)
    return () => query.removeEventListener('change', listener)
  }
  query.addListener(listener)
  return () => query.removeListener(listener)
}

function setMetaContent(name: string, content: string): void {
  const selector = `meta[name="${name}"]`
  const existing = document.head.querySelector<HTMLMetaElement>(selector)
  const meta = existing ?? document.head.appendChild(document.createElement('meta'))
  meta.name = name
  meta.content = content
}

const defaultTranslator: SiteTranslator = <Key extends MessageKey>(key: Key, params?: MessageParamsFor<Key>) => translate(DEFAULT_SITE_LANGUAGE, key, params)

const defaultPreferences: SitePreferences = {
  language: DEFAULT_SITE_LANGUAGE,
  theme: 'auto',
  resolvedTheme: 'dark',
  t: defaultTranslator,
  setLanguage: () => undefined,
  setTheme: () => undefined,
}

const SitePreferencesContext = createContext<SitePreferences>(defaultPreferences)

export function SitePreferencesProvider({ children, initialLanguage, initialTheme, storage }: SitePreferencesProviderProps) {
  const [language, setLanguageState] = useState<SiteLanguage>(() => {
    if (initialLanguage !== undefined) return initialLanguage
    const persisted = readStorage(storage, LANGUAGE_STORAGE_KEY)
    return isSiteLanguage(persisted) ? persisted : resolveBrowserLanguage(browserLanguages())
  })
  const [theme, setThemeState] = useState<SiteTheme>(() => {
    if (initialTheme !== undefined) return initialTheme
    const persisted = readStorage(storage, THEME_STORAGE_KEY)
    return isSiteTheme(persisted) ? persisted : 'auto'
  })
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const query = window.matchMedia(DARK_MODE_QUERY)
    setSystemDark(query.matches)
    return subscribeToMediaQuery(query, event => setSystemDark(event.matches))
  }, [])

  const setLanguage = useCallback((next: SiteLanguage) => {
    setLanguageState(next)
    writeStorage(storage, LANGUAGE_STORAGE_KEY, next)
  }, [storage])

  const setTheme = useCallback((next: SiteTheme) => {
    setThemeState(next)
    if (next === 'auto') removeStorage(storage, THEME_STORAGE_KEY)
    else writeStorage(storage, THEME_STORAGE_KEY, next)
  }, [storage])

  const resolvedTheme: Exclude<SiteTheme, 'auto'> = theme === 'auto' ? (systemDark ? 'dark' : 'light') : theme
  const t = useMemo<SiteTranslator>(() => (key, params) => translate(language, key, params), [language])

  useEffect(() => {
    const root = document.documentElement
    root.lang = language === 'zh' ? 'zh-CN' : 'en'
    root.dataset.theme = resolvedTheme
    root.dataset.themePreference = theme
    root.style.colorScheme = resolvedTheme
    document.title = translate(language, 'metadata.title')
    setMetaContent('description', translate(language, 'metadata.description'))
    setMetaContent('theme-color', resolvedTheme === 'light' ? '#f7f8fa' : translate(language, 'metadata.themeColor'))
  }, [language, resolvedTheme, theme])

  const value = useMemo<SitePreferences>(() => ({ language, theme, resolvedTheme, t, setLanguage, setTheme }), [language, resolvedTheme, setLanguage, setTheme, t, theme])
  return <SitePreferencesContext.Provider value={value}>{children}</SitePreferencesContext.Provider>
}

export function useSitePreferences(): SitePreferences {
  return useContext(SitePreferencesContext)
}

export function useSiteMessage<Key extends MessageKey>(key: Key, params?: MessageParamsFor<Key>): string {
  return useSitePreferences().t(key, params)
}

export function resolvedThemeFor(theme: SiteTheme, systemDark: boolean): Exclude<SiteTheme, 'auto'> {
  return theme === 'auto' ? (systemDark ? 'dark' : 'light') : theme
}

export function siteThemeMediaQuery(): string {
  return DARK_MODE_QUERY
}
