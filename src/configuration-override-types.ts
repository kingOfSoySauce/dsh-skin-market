import type { OperationMessageKey, OperationMessageParams } from './operation-message.ts'

/** Public diagnostic projection. Contains no configuration contents or editable paths. */
export interface ConfigurationOverridePlan {
  status: 'repairable' | 'blocked' | 'none'
  context?: string
  source?: 'home'
  /** Display only; the editor resolves its location from the trusted Host. */
  file?: string
  rowId: string
  previousDisabled?: boolean
  desiredEnabled: boolean
  sharedAcrossProfiles: true
  reason: string
  /** Catalog key for the raw diagnostic; older Hosts omit it. */
  reasonKey?: OperationMessageKey
  reasonParams?: OperationMessageParams
}

/** One approval covers every target against the same shared-file snapshot. */
export interface ConfigurationOverrideBatchPlan {
  status: 'repairable' | 'blocked' | 'none'
  context?: string
  /** Binds the reviewed selection to the current market/profile state. */
  selectionContext?: string
  changes: Array<ConfigurationOverridePlan & { skinId: string }>
  reason: string
  /** Catalog key for the raw diagnostic; older Hosts omit it. */
  reasonKey?: OperationMessageKey
  reasonParams?: OperationMessageParams
}
