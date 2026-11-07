import type { LocalizedSkinCopy } from '../types.ts'

export type MarketHostKind = 'dsh' | 'desktop'

import type { ConfigurationOverridePlan } from '../configuration-override-types.ts'
import type { OperationMessageFields, OperationStepFields } from '../operation-message.ts'
export type { ConfigurationOverridePlan } from '../configuration-override-types.ts'

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
  localizedCopy?: LocalizedSkinCopy
  repo: string
  subpath?: string
  package: string
  rowId: string
  /** Older catalogs use theme, anime, interactive, or background. Those count as skin. */
  category?: string
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
  heat?: SkinHeat
}

/** Heat is normalized by the skin's own observed age, not DSH's age. */
export interface SkinHeat {
  ageDays: number
  starsPerDay: number
  starGrowthPerDay: number
  commitsPerDay: number
  pullsPerDay: number
  issuesPerDay: number
  score: number
  asOf: string
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
  activation: 'inactive' | 'active' | 'switching' | 'restart-required' | 'unavailable'
  primary?: boolean
  pinned?: boolean
  installedVersion: string | null
  installedAt?: string | null
  lastOperatedAt?: string | null
  updateAvailable: boolean
  clientModule?: boolean
  restartSource?: 'selection'
  selectionHostApplied?: boolean
  selectionHostStatus?: 'applied' | 'switching' | 'restart-required' | 'unavailable'
  selectionClientTargets?: Array<{ package: string; active: boolean }>
  sourceMigration?: { target: string; currentSource: string } & ({ kind?: undefined } | {
    kind: 'local'
    currentVersion: string
    targetVersion: string
    context: string
    downgrade: boolean
  })
  artifactRisk?: { context: string; packageName: string; version: string; warnings: string[] }
  error?: string
  errorKey?: OperationMessageFields['messageKey']
  errorParams?: OperationMessageFields['messageParams']
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
  kind: 'install' | 'activate' | 'deactivate' | 'pin' | 'unpin' | 'update' | 'migrate' | 'uninstall'
  skinId: string
  preservedSkinIds?: string[]
  preservedSkinApprovals?: Record<string, { compatibilityContext: string; artifactContext?: string }>
  selectionContext?: string
  phase: 'queued' | 'resolving' | 'downloading' | 'installing' | 'validating' | 'activating' | 'waiting' | 'cancelling' | 'cancelled' | 'done' | 'failed'
  message?: string
  messageKey?: OperationMessageFields['messageKey']
  messageParams?: OperationMessageFields['messageParams']
  cancelable?: boolean
  application?: 'applied' | 'restart-required' | 'overridden' | 'failed' | 'cancelled'
  restartRequired?: boolean
  downloadedBytes?: number
  totalBytes?: number
  bytesPerSecond?: number
  step?: string
  stepKey?: OperationStepFields['stepKey']
  stepParams?: OperationStepFields['stepParams']
  stepStartedAt?: string
  attempt?: number
  lastOutputAt?: string
  pnpmStage?: 'resolving' | 'downloading' | 'linking' | 'building'
  failure?: {
    kind: 'release-age' | 'network' | 'fetch-timeout' | 'build-approval' | 'fetch-404' | 'existing-source-unreachable' | 'adding-to-root' | 'not-a-workspace' | 'unexpected-store' | 'compatibility' | 'conflict' | 'command' | 'lockfile-outdated' | 'lockfile-broken' | 'script-timeout' | 'pnpm-missing' | 'no-matching-version' | 'disk-full' | 'permission' | 'integrity' | 'configuration-override'
    message: string
    messageKey?: OperationMessageFields['messageKey']
    messageParams?: OperationMessageFields['messageParams']
    code?: string
    desiredEnabled?: boolean
    targetSkinId?: string
    configurationOverride?: ConfigurationOverridePlan
    packageName?: string
    unreachableSource?: { repository: string; commit: string }
    buildKeys?: string[]
    releaseAgeTarget?: { packageName: string; version: string }
    artifactRisk?: { context: string; packageName: string; version: string; warnings: string[] }
    manualSpec?: string
    manualFollowUp?: 'uninstall-then-add' | 'enable' | 'install' | 'check'
    fallbackSpec?: string
    action?: 'retry' | 'approve-build' | 'approve-release-age' | 'approve-artifact' | 'repair-configuration'
    conflicts?: Array<{ kind: 'package' | 'repository' | 'row' | 'loader'; incoming: string; existing: string; identifiers: string[] }>
  }
  startedAt: string
  finishedAt?: string
}
