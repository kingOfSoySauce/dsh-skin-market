import React from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { TShirtIcon } from '@phosphor-icons/react'
import { IconAgentPresetOutline16, IconDataOutline16, IconPersonalizationOutline16, IconSettingsOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { SkinMarketSection } from '../src/client/SkinMarketSection.tsx'
import type { RuntimeSkin } from '../src/client/types.ts'
import catalogWire from '../data/catalog.json'
import { decodeCatalogWire } from '../src/catalog-wire.ts'
import './preview.css'

const catalog = decodeCatalogWire(catalogWire)
const skins = catalog.skins.map(skin => ({ ...skin, githubStars: skin.starsSnapshot, starsStale: false, recommendations: catalog.skins.filter(item => item.id !== skin.id).map(item => item.id) }))
const runtime = new Map<string, RuntimeSkin>(skins.map((skin, index) => [skin.id, index === 0
  ? { skinId: skin.id, installation: 'installed', activation: 'active', primary: true, pinned: false, installedVersion: skin.install.version, updateAvailable: true }
  : { skinId: skin.id, installation: index === 1 ? 'installed' : 'missing', activation: 'inactive', primary: false, pinned: false, installedVersion: index === 1 ? skin.install.version : null, updateAvailable: index === 1 }]))
const operations = new Map<string, { id: string; phase: string; message?: string }>()
for (const skin of skins) {
  const state = runtime.get(skin.id)!
  if (state.installation === 'installed' && skin.install.npm !== undefined) {
    state.sourceMigration = { target: `${skin.install.npm.name}@${skin.install.npm.version}`, currentSource: skin.install.target }
  }
}

declare global {
  interface Window { __dshSkinMarketPreviewRoot?: Root }
}

window.fetch = async (input, init) => {
  const url = String(input)
  if (url.endsWith('/catalog')) return new Response(JSON.stringify({ skins }), { status: 200 })
  if (url.endsWith('/state')) return new Response(JSON.stringify({ skins: [...runtime.values()] }), { status: 200 })
  if (url.includes('/operations/')) return new Response(JSON.stringify(operations.get(url.split('/').pop() ?? '') ?? { phase: 'done' }), { status: 200 })
  const kind = url.split('/').pop() ?? ''
  const skinId = JSON.parse(String(init?.body ?? '{}')).skinId as string
  const id = crypto.randomUUID()
  const state = runtime.get(skinId)!
  if (kind === 'install') runtime.set(skinId, { ...state, installation: 'installed', installedVersion: skins.find(skin => skin.id === skinId)?.install.version ?? null })
  if (kind === 'activate') {
    for (const [key, value] of runtime) runtime.set(key, { ...value, primary: key === skinId, activation: key === skinId || value.pinned ? 'active' : 'inactive' })
  }
  if (kind === 'deactivate') runtime.set(skinId, { ...state, activation: 'inactive', primary: false, pinned: false })
  if (kind === 'pin') runtime.set(skinId, { ...state, pinned: true })
  if (kind === 'unpin') runtime.set(skinId, { ...state, pinned: false, activation: state.primary ? 'active' : 'inactive' })
  if (kind === 'uninstall') runtime.set(skinId, { ...state, installation: 'missing', activation: 'inactive', primary: false, pinned: false, installedVersion: null })
  if (kind === 'migrate') runtime.set(skinId, { ...state, sourceMigration: undefined })
  operations.set(id, { id, phase: 'done' })
  return new Response(JSON.stringify({ operationId: id }), { status: 202 })
}

const t = (key: string) => ({ title: '皮肤市场', subtitle: '发现并管理 DSH 外观', search: '搜索皮肤、作者或标签', catalog: '皮肤列表' }[key] ?? key)

function Preview() {
  return <div className="stage">
    <div className="settings-dialog">
      <nav className="settings-nav">
        <h1>设置</h1>
        <button><IconSettingsOutline16 />通用设置</button>
        <button><IconDataOutline16 />模型</button>
        <button><IconPersonalizationOutline16 />插件</button>
        <button><IconAgentPresetOutline16 />Agent 预设</button>
        <button className="active"><TShirtIcon size={16} />皮肤市场</button>
      </nav>
      <div className="settings-content"><SkinMarketSection t={t} /></div>
    </div>
  </div>
}

const previewRoot = window.__dshSkinMarketPreviewRoot ??= createRoot(document.getElementById('root')!)
previewRoot.render(<Preview />)
