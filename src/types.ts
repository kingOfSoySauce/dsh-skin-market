export type MarketHostKind = 'dsh' | 'desktop'

export type DesktopInstallCapability =
  | {
      mode: 'managed'
      registry: 'npm'
      packageName: string
      packageVersion: string
      integrity?: string
    }
  | {
      mode: 'manual-only'
      reason: string
    }

export interface NpmInstallSource {
  name: string
  version: string
  integrity: string
  repository: string
  gitHead: string
}

export interface CompatibilityAdapter {
  id: string
  kind: 'keyed-slot-id-to-key'
  when: string
  slot: string
  key: 'locale' | string
}

export interface DshRuntime {
  version: string | null
  capabilities: string[]
  source: 'host-package' | 'injected' | 'unknown'
}

export interface SkinCompanion {
  package: string
  target: string
  version: string
  commit: string
  rowId: string
}

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
  install: { target: string; version: string; commit: string; allowBuild?: string; npm?: NpmInstallSource; desktop?: DesktopInstallCapability; companions?: SkinCompanion[] }
  compatibility: { dsh: string; platform: string[]; adapters?: CompatibilityAdapter[] }
  marketScreenshots?: string[]
  listScreenshot?: string
  screenshots: string[]
  media?: CatalogMedia
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

export interface CatalogImageMedia {
  preview: string
  full: string
}

export interface CatalogMedia {
  list?: CatalogImageMedia
  screenshots: Array<CatalogImageMedia | null>
}

export interface HealthScanFinding {
  code: string
  message: string
}

export interface HealthScanSnapshot {
  commit: string
  packageVersion: string
  scannerVersion: string
  dshVersion?: string
  mode: 'static' | 'runtime'
  result: 'pass' | 'warn' | 'fail' | 'unknown'
  checkedAt: string
  findings: HealthScanFinding[]
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
  scan?: HealthScanSnapshot
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
  primary: boolean
  pinned: boolean
  installedVersion: string | null
  installedSpec: string | null
  installedAt: string | null
  lastOperatedAt: string | null
  updateAvailable: boolean
  sourceMigration?: { target: string; currentSource: string }
  error?: string
}

export interface InstalledClientPlugin {
  package: string
  version: string | null
  spec: string
  rowIds: string[]
  registered: boolean
}

export type InstallConflictKind = 'package' | 'repository' | 'row' | 'loader'

export interface InstallConflict {
  kind: InstallConflictKind
  incoming: string
  existing: string
  identifiers: string[]
}

export type OperationKind = 'install' | 'activate' | 'deactivate' | 'pin' | 'unpin' | 'update' | 'migrate' | 'uninstall'
export type OperationPhase = 'queued' | 'resolving' | 'downloading' | 'installing' | 'validating' | 'activating' | 'cancelling' | 'cancelled' | 'done' | 'failed'
export type OperationRetryAction = 'retry' | 'approve-build'

export interface OperationFailure {
  kind: 'release-age' | 'network' | 'fetch-timeout' | 'build-approval' | 'fetch-404' | 'adding-to-root' | 'not-a-workspace' | 'compatibility' | 'conflict' | 'command'
  message: string
  packageName?: string
  action?: OperationRetryAction
  conflicts?: InstallConflict[]
}

export interface Operation {
  id: string
  kind: OperationKind
  skinId: string
  phase: OperationPhase
  message?: string
  cancelable?: boolean
  downloadedBytes?: number
  totalBytes?: number
  bytesPerSecond?: number
  step?: string
  stepStartedAt?: string
  attempt?: number
  lastOutputAt?: string
  pnpmStage?: 'resolving' | 'downloading' | 'linking' | 'building'
  failure?: OperationFailure
  startedAt: string
  finishedAt?: string
}

export interface PersistedMarketState {
  version: 1
  activeSkinId: string | null
  disabledSkinIds: string[]
  pinnedSkinIds?: string[]
  activity?: Record<string, SkinActivity>
  /** Companion packages linked to installed owner skins. */
  managedCompanions?: Record<string, ManagedCompanionState>
  /** Non-primary loader rows introduced by a market install. */
  managedLoaders?: Record<string, ManagedLoaderState>
}

export interface ManagedCompanionState {
  ownerSkinIds: string[]
  /** Only packages installed by the market may be removed with their last owner. */
  installedByMarket: boolean
}

export interface ManagedLoaderState {
  id: string
  name?: string
  packageName?: string
  ownerSkinIds: string[]
}

export interface SkinActivity {
  installedAt?: string
  updatedAt?: string
  usedAt?: string
}

export interface LoaderEntry {
  options: { id?: string; name?: string; disabled?: boolean | null }
  fiber?: unknown
  update(options: { disabled: boolean | null }, create?: boolean, force?: boolean): Promise<void>
}
