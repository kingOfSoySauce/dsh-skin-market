import type { IncomingMessage, ServerResponse } from 'node:http'
import type { OperationRetryAction, SelectionOperationKind } from './types.ts'

export function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(body)
}

export function sendText(response: ServerResponse, status: number, value: string): void {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
  response.end(value)
}

/**
 * Whether a Host header names a loopback authority.
 *
 * The Desktop proxy may remove Host before forwarding a request into the
 * in-process DSH server, so an absent header is handled by sameOrigin below.
 * When it is present, keep the DNS-rebinding guard: a public page must not be
 * able to make a matching Origin/Host pair for an arbitrary authority.
 */
export function loopbackAuthority(host: string | undefined): boolean {
  if (host === undefined) return false
  const lower = host.toLowerCase()
  const name = lower.startsWith('[') ? lower.slice(0, lower.indexOf(']') + 1) : lower.split(':')[0]!
  return name === '127.0.0.1' || name === 'localhost' || name === '[::1]'
}

/**
 * Accept same-origin browser requests and the official Desktop proxy's
 * header-stripped requests. A missing Origin is allowed because the proxy
 * strips it; a present but invalid/cross-site Origin remains rejected.
 */
function authority(value: string): URL | null {
  if (/[\s/@?#\\]/.test(value)) return null
  try {
    const parsed = new URL(`http://${value}`)
    return parsed.hostname === '' || parsed.pathname !== '/' ? null : parsed
  } catch { return null }
}

export function trustedAuthority(host: string, trustedHosts: readonly string[]): boolean {
  const parsed = authority(host)
  if (parsed === null) return false
  return trustedHosts.some(value => {
    const trusted = authority(value)
    const explicitPort = value.startsWith('[') ? /\]:\d+$/.test(value) : /:\d+$/.test(value)
    return trusted !== null && (explicitPort ? trusted.host === parsed.host : trusted.hostname === parsed.hostname)
  })
}

export function sameOrigin(request: IncomingMessage, trustedHosts: readonly string[] = []): boolean {
  const host = request.headers.host
  if (host !== undefined && !loopbackAuthority(host) && !trustedAuthority(host, trustedHosts)) return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    const parsed = new URL(origin)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    if (parsed.host === authority(host ?? '')?.host) return true
    // Chrome 151+ omits the explicit port from same-origin loopback Origins.
    // Keep exact-port matching for declared public hosts; only the loopback
    // fence may accept the omitted port, and the hostname must still match.
    if (parsed.port === '' && host !== undefined && loopbackAuthority(host)) {
      const hostAuthority = authority(host)
      return hostAuthority !== null && parsed.hostname === hostAuthority.hostname
    }
    return false
  } catch { return false }
}

export interface HostConnectionLike {
  trustedHosts?: unknown
  requestRejection?(request: IncomingMessage): number | undefined
}

/** Consult the same host admission policy as its own API, including browser login. */
export function refuseUnadmitted(request: IncomingMessage, response: ServerResponse, connection?: HostConnectionLike): boolean {
  if (typeof connection?.requestRejection !== 'function') return false
  let status: number | undefined
  try { status = connection.requestRejection(request) } catch { status = 403 }
  if (status === undefined) return false
  const loginRequired = status === 401
  sendJson(response, status === 401 ? 401 : 403, {
    error: loginRequired ? '请先登录当前 DSH 宿主' : '请求未通过宿主验证',
    errorKey: loginRequired ? 'server.loginRequired' : 'server.requestNotAdmitted',
  })
  return true
}

export function directLoopbackRequest(request: IncomingMessage): boolean {
  const address = request.socket?.remoteAddress
  return loopbackAuthority(request.headers.host)
    && (address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1')
    && !Object.keys(request.headers).some(key => key === 'forwarded' || key === 'x-real-ip' || key.startsWith('x-forwarded-'))
}

async function readJsonBody(request: IncomingMessage, limit: number, allowEmpty = false): Promise<Record<string, unknown>> {
  const isJson = String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')
  if (!allowEmpty && !isJson) throw new Error('content-type must be application/json')
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > limit) throw new Error('request body too large')
    chunks.push(buffer)
  }
  if (allowEmpty && size === 0) return {}
  if (!isJson) throw new Error('content-type must be application/json')
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid request body')
  return body as Record<string, unknown>
}

function compatibilityAcknowledgement(body: Record<string, unknown>): { acknowledgeCompatibility: boolean; compatibilityContext?: string } {
  if (body.acknowledgeCompatibility !== undefined && typeof body.acknowledgeCompatibility !== 'boolean') throw new Error('invalid compatibility acknowledgement')
  if (body.acknowledgeCompatibility !== true) return { acknowledgeCompatibility: false }
  if (typeof body.compatibilityContext !== 'string' || body.compatibilityContext.length === 0 || body.compatibilityContext.length > 4096) throw new Error('invalid compatibility context')
  return { acknowledgeCompatibility: true, compatibilityContext: body.compatibilityContext }
}

function artifactAcknowledgement(body: Record<string, unknown>): { artifactContext?: string } {
  if (body.artifactContext === undefined) return {}
  if (typeof body.artifactContext !== 'string' || body.artifactContext.length === 0 || body.artifactContext.length > 4096) throw new Error('invalid artifact context')
  return { artifactContext: body.artifactContext }
}

function preservedSkinApprovals(body: Record<string, unknown>): Record<string, { compatibilityContext: string; artifactContext?: string }> | undefined {
  if (body.preservedSkinApprovals === undefined) return undefined
  if (body.preservedSkinApprovals === null || typeof body.preservedSkinApprovals !== 'object' || Array.isArray(body.preservedSkinApprovals)) throw new Error('invalid preserved skin approvals')
  const entries = Object.entries(body.preservedSkinApprovals)
  if (entries.length > 512) throw new Error('invalid preserved skin approvals')
  const result: Record<string, { compatibilityContext: string; artifactContext?: string }> = {}
  for (const [skinId, value] of entries) {
    if (skinId.length === 0 || skinId.length > 128 || value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid preserved skin approvals')
    const approval = value as Record<string, unknown>
    if (typeof approval.compatibilityContext !== 'string' || approval.compatibilityContext.length === 0 || approval.compatibilityContext.length > 4096) throw new Error('invalid preserved skin approvals')
    if (approval.artifactContext !== undefined && (typeof approval.artifactContext !== 'string' || approval.artifactContext.length === 0 || approval.artifactContext.length > 4096)) throw new Error('invalid preserved skin approvals')
    result[skinId] = { compatibilityContext: approval.compatibilityContext, ...(typeof approval.artifactContext === 'string' ? { artifactContext: approval.artifactContext } : {}) }
  }
  return result
}

export async function readSkinMutation(request: IncomingMessage, limit = 8192): Promise<{ skinId: string; acknowledgeCompatibility: boolean; compatibilityContext?: string; artifactContext?: string; configurationContext?: string; sourceContext?: string; preservedSkinIds?: string[]; preservedSkinApprovals?: Record<string, { compatibilityContext: string; artifactContext?: string }>; selectionContext?: string }> {
  const body = await readJsonBody(request, limit)
  if (typeof body.skinId !== 'string' || body.skinId.length > 128) throw new Error('invalid skinId')
  if (body.preservedSkinIds !== undefined && (!Array.isArray(body.preservedSkinIds) || body.preservedSkinIds.length > 512
    || body.preservedSkinIds.some(id => typeof id !== 'string' || id.length === 0 || id.length > 128))) throw new Error('invalid preserved skin ids')
  if (body.sourceContext !== undefined && (typeof body.sourceContext !== 'string' || body.sourceContext.length !== 64 || !/^[a-f0-9]{64}$/.test(body.sourceContext))) throw new Error('invalid source context')
  if (body.configurationContext !== undefined && (typeof body.configurationContext !== 'string' || !/^[a-f0-9]{64}$/.test(body.configurationContext))) throw new Error('invalid configuration context')
  if (body.selectionContext !== undefined && (typeof body.selectionContext !== 'string' || !/^[a-f0-9]{64}$/.test(body.selectionContext))) throw new Error('invalid selection context')
  const approvals = preservedSkinApprovals(body)
  if (body.configurationContext !== undefined && Object.keys(body).some(key => !['skinId', 'configurationContext', 'acknowledgeCompatibility', 'compatibilityContext', 'artifactContext', 'preservedSkinIds', 'preservedSkinApprovals', 'selectionContext'].includes(key))) throw new Error('invalid configuration repair request')
  return { skinId: body.skinId, ...compatibilityAcknowledgement(body), ...artifactAcknowledgement(body),
    ...(typeof body.configurationContext === 'string' ? { configurationContext: body.configurationContext } : {}),
    ...(typeof body.sourceContext === 'string' ? { sourceContext: body.sourceContext } : {}),
    ...(Array.isArray(body.preservedSkinIds) ? { preservedSkinIds: [...new Set(body.preservedSkinIds as string[])] } : {}),
    ...(approvals === undefined ? {} : { preservedSkinApprovals: approvals }),
    ...(typeof body.selectionContext === 'string' ? { selectionContext: body.selectionContext } : {}) }
}

export async function readSelectionPlan(request: IncomingMessage, limit = 8192): Promise<{ skinId: string; kind: SelectionOperationKind; preservedSkinIds?: string[] }> {
  const body = await readJsonBody(request, limit)
  if (Object.keys(body).some(key => key !== 'skinId' && key !== 'kind' && key !== 'preservedSkinIds')) throw new Error('invalid selection plan request')
  if (typeof body.skinId !== 'string' || body.skinId.length === 0 || body.skinId.length > 128) throw new Error('invalid skinId')
  if (body.kind !== 'activate' && body.kind !== 'deactivate' && body.kind !== 'pin' && body.kind !== 'unpin') throw new Error('invalid selection operation')
  if (body.preservedSkinIds !== undefined && (!Array.isArray(body.preservedSkinIds) || body.preservedSkinIds.length > 512
    || body.preservedSkinIds.some(id => typeof id !== 'string' || id.length === 0 || id.length > 128))) throw new Error('invalid preserved skin ids')
  return { skinId: body.skinId, kind: body.kind, ...(Array.isArray(body.preservedSkinIds) ? { preservedSkinIds: [...new Set(body.preservedSkinIds as string[])] } : {}) }
}

export async function readSkinId(request: IncomingMessage, limit = 8192): Promise<string> {
  return (await readSkinMutation(request, limit)).skinId
}

export async function readOperationRetry(request: IncomingMessage, limit = 8192): Promise<{ action: OperationRetryAction; acknowledgeCompatibility: boolean; compatibilityContext?: string; artifactContext?: string; configurationContext?: string }> {
  const body = await readJsonBody(request, limit)
  if (body.action !== 'retry' && body.action !== 'approve-build' && body.action !== 'approve-release-age' && body.action !== 'approve-artifact' && body.action !== 'repair-configuration') throw new Error('invalid operation retry action')
  if (body.configurationContext !== undefined && (body.action !== 'repair-configuration' || typeof body.configurationContext !== 'string' || !/^[a-f0-9]{64}$/.test(body.configurationContext))) throw new Error('invalid configuration context')
  if (body.action === 'repair-configuration' && body.configurationContext === undefined) throw new Error('configuration context required')
  if (body.action === 'repair-configuration' && Object.keys(body).some(key => !['action', 'configurationContext', 'acknowledgeCompatibility', 'compatibilityContext', 'artifactContext'].includes(key))) throw new Error('invalid configuration repair request')
  if (body.sourceContext !== undefined) throw new Error('invalid source context')
  return { action: body.action, ...compatibilityAcknowledgement(body), ...artifactAcknowledgement(body),
    ...(typeof body.configurationContext === 'string' ? { configurationContext: body.configurationContext } : {}) }
}

export async function readOperationRetryAction(request: IncomingMessage, limit = 8192): Promise<OperationRetryAction> {
  return (await readOperationRetry(request, limit)).action
}

export async function readMarketUpdateRetryAction(request: IncomingMessage, limit = 8192): Promise<'retry' | 'approve-release-age'> {
  const body = await readJsonBody(request, limit, true)
  if (Object.keys(body).some(key => key !== 'action') || body.action !== undefined && body.action !== 'retry' && body.action !== 'approve-release-age') throw new Error('invalid market update retry action')
  return body.action === 'approve-release-age' ? body.action : 'retry'
}

export type RestartTarget = { kind: 'skin'; skinId: string } | { kind: 'market-update' }

export async function readRestartTarget(request: IncomingMessage, limit = 8192): Promise<RestartTarget> {
  const body = await readJsonBody(request, limit)
  if (body.reason === 'market-update' && body.skinId === undefined) return { kind: 'market-update' }
  if (typeof body.skinId === 'string' && body.skinId.length <= 128 && body.reason === undefined) return { kind: 'skin', skinId: body.skinId }
  throw new Error('invalid restart target')
}
