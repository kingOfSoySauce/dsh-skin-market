export type MarketHostKind = 'dsh' | 'desktop'

export interface DshRuntime {
  version: string | null
  capabilities: string[]
  source: 'host-package' | 'injected' | 'unknown'
}

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

export interface CatalogSkin {
  id: string
  name: { zh: string; en: string }
  author: string
  description: string
  repo: string
  subpath?: string
  package: string
  rowId: string
  tags: string[]
  modes: string[]
  install: { target: string; version: string; commit: string; allowBuild?: string; npm?: NpmInstallSource; desktop?: DesktopInstallCapability; companions?: Array<{ package: string; target: string; version: string; commit: string; rowId: string }> }
  compatibility: { dsh: string; platform: string[]; adapters?: Array<{ id: string; kind: 'keyed-slot-id-to-key'; when: string; slot: string; key: 'locale' | string }> }
  marketScreenshots?: string[]
  listScreenshot?: string
  screenshots: string[]
  media?: CatalogMedia
  review?: { compatibility: 'verified' | 'unverified'; preview: 'verified' | 'repository-card'; installation: 'verified' | 'manual-only' }
  health?: {
    status: 'healthy' | 'improvements'
    checks: {
      readmeScreenshots: 'pass' | 'improve'
      compatibility: 'pass' | 'improve'
      installation: 'pass' | 'improve'
      installCommand?: 'pass' | 'improve'
      topic?: 'pass' | 'improve'
    }
    suggestions: string[]
    scan?: {
      commit: string
      packageVersion: string
      scannerVersion: string
      dshVersion?: string
      mode: 'static' | 'runtime'
      result: 'pass' | 'warn' | 'fail' | 'unknown'
      checkedAt: string
      findings: Array<{ code: string; message: string }>
    }
  }
  license: { code: string; commercialUse: boolean; notice?: string }
  githubStars: number
  starsStale: boolean
  starsUpdatedAt: string
  recommendations: string[]
  releaseUpdatedAt: string
  metadataUpdatedAt: string
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

export interface RuntimeSkin {
  skinId: string
  installation: 'missing' | 'installed' | 'updating' | 'broken'
  activation: 'inactive' | 'active' | 'switching' | 'restart-required'
  primary?: boolean
  pinned?: boolean
  installedVersion: string | null
  installedAt?: string | null
  lastOperatedAt?: string | null
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

export interface Operation {
  id: string
  kind: 'install' | 'activate' | 'deactivate' | 'pin' | 'unpin' | 'update' | 'uninstall'
  skinId: string
  phase: 'queued' | 'resolving' | 'downloading' | 'installing' | 'validating' | 'activating' | 'cancelling' | 'cancelled' | 'done' | 'failed'
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
  failure?: {
    kind: 'release-age' | 'network' | 'fetch-timeout' | 'build-approval' | 'fetch-404' | 'adding-to-root' | 'not-a-workspace' | 'compatibility' | 'conflict' | 'command'
    message: string
    packageName?: string
    action?: 'retry' | 'approve-build'
    conflicts?: Array<{ kind: 'package' | 'repository' | 'row' | 'loader'; incoming: string; existing: string; identifiers: string[] }>
  }
  startedAt: string
  finishedAt?: string
}
