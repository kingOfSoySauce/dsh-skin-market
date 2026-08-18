export interface SkinEntry {
  id: string
  name: { zh: string; en: string }
  author: string
  description: string
  repo: string
  subpath?: string
  package: string
  rowId: string
  category: string
  tags: string[]
  modes: Array<'light' | 'dark'>
  install: { target: string; version: string; commit: string; allowBuild?: string }
  compatibility: { dsh: string; platform: string[] }
  marketScreenshots?: string[]
  listScreenshot?: string
  screenshots: string[]
  review?: { compatibility: 'verified' | 'unverified'; preview: 'verified' | 'repository-card'; installation: 'verified' | 'manual-only' }
  health?: SkinHealth
  license: { code: string; commercialUse: boolean; notice?: string }
  featuredRank: number
  starsSnapshot: number
  releaseUpdatedAt: string
  metadataUpdatedAt: string
  starsUpdatedAt: string
  updatedAt: string
}

export interface SkinHealth {
  status: 'healthy' | 'improvements'
  checks: {
    readmeScreenshots: 'pass' | 'improve'
    compatibility: 'pass' | 'improve'
    installation: 'pass' | 'improve'
    installCommand?: 'pass' | 'improve'
    topic?: 'pass' | 'improve'
  }
  suggestions: string[]
}

export interface CatalogFile {
  schemaVersion: number
  generatedAt: string
  skins: SkinEntry[]
}

export interface CatalogSkin extends SkinEntry {
  githubStars: number
  starsStale: boolean
  starsUpdatedAt: string
  recommendations: string[]
}

export type InstallationState = 'missing' | 'installed' | 'updating' | 'broken'
export type ActivationState = 'inactive' | 'active' | 'switching' | 'restart-required'

export interface SkinRuntimeState {
  skinId: string
  installation: InstallationState
  activation: ActivationState
  installedVersion: string | null
  installedSpec: string | null
  installedAt: string | null
  updateAvailable: boolean
  error?: string
}

export interface InstalledClientPlugin {
  package: string
  version: string | null
  spec: string
  rowIds: string[]
  registered: boolean
}

export type OperationKind = 'install' | 'activate' | 'deactivate' | 'update' | 'uninstall'
export type OperationPhase = 'queued' | 'resolving' | 'downloading' | 'validating' | 'activating' | 'done' | 'failed'

export interface Operation {
  id: string
  kind: OperationKind
  skinId: string
  phase: OperationPhase
  message?: string
  startedAt: string
  finishedAt?: string
}

export interface PersistedMarketState {
  version: 1
  activeSkinId: string | null
  disabledSkinIds: string[]
}

export interface LoaderEntry {
  options: { id?: string; name?: string; disabled?: boolean | null }
  fiber?: unknown
  update(options: { disabled: boolean | null }, create?: boolean, force?: boolean): Promise<void>
}
