import type { Operation, OperationPhase } from '../../src/types.ts'

/** Phases after which the lifecycle will not change an operation again. */
export const TERMINAL_PHASES: readonly OperationPhase[] = ['done', 'failed', 'cancelled']

export interface WaitOptions {
  /** Poll attempts before failing. */
  attempts?: number
  /** Delay between polls in milliseconds. */
  intervalMs?: number
  message?: string
}

/**
 * Poll a predicate until it holds. Each spec used to inline this loop with its
 * own attempt budget; keep the budget explicit at the call site instead.
 */
export async function waitUntil(predicate: () => boolean, options: WaitOptions = {}): Promise<void> {
  const { attempts = 200, intervalMs = 5, message = 'lifecycle condition did not settle' } = options
  for (let index = 0; index < attempts; index++) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  throw new Error(message)
}

export interface OperationWaitOptions extends WaitOptions {
  /** Phases that count as settled; defaults to done/failed/cancelled. */
  terminal?: readonly OperationPhase[]
}

export async function waitForOperation(operation: Operation, options: OperationWaitOptions = {}): Promise<Operation> {
  const terminal = options.terminal ?? TERMINAL_PHASES
  await waitUntil(() => terminal.includes(operation.phase), options)
  return operation
}

/** Bind the shared poll loop to one spec's historical timing budget. */
export function operationWaiter(options: OperationWaitOptions = {}) {
  return (operation: Operation): Promise<Operation> => waitForOperation(operation, options)
}

/** Bind the shared poll loop to one spec's historical timing budget. */
export function conditionWaiter(options: WaitOptions = {}) {
  return (predicate: () => boolean): Promise<void> => waitUntil(predicate, options)
}
