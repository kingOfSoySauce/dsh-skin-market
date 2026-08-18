export interface CatalogSkin {
  id: string
  name: { zh: string; en: string }
  author: string
  description: string
  repo: string
  package: string
  rowId: string
  tags: string[]
  modes: string[]
  install: { target: string; version: string; commit: string; allowBuild?: string }
  compatibility: { dsh: string; platform: string[] }
  marketScreenshots?: string[]
  listScreenshot?: string
  screenshots: string[]
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

export interface RuntimeSkin {
  skinId: string
  installation: 'missing' | 'installed' | 'updating' | 'broken'
  activation: 'inactive' | 'active' | 'switching' | 'restart-required'
  installedVersion: string | null
  installedAt?: string | null
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
  phase: 'queued' | 'resolving' | 'downloading' | 'validating' | 'activating' | 'done' | 'failed'
  message?: string
}
