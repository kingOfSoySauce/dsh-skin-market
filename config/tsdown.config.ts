import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from 'lightningcss'
import { defineConfig } from 'tsdown'

const id = 'dsh-skin-market'
// tsdown resolves entry/outDir relative to this config file, so pin them to the repo root.
const root = fileURLToPath(new URL('..', import.meta.url))
const externals = ['react', 'react/jsx-runtime', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives']
const cssPrefix = '\0dsh-skin-market-css:'
const cssSuffix = '.mjs'

export default defineConfig({
  entry: { client: resolve(root, 'src/client/index.ts') },
  outDir: resolve(root, 'client'),
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  dts: false,
  sourcemap: true,
  clean: false,
  external: externals,
  noExternal: source => externals.includes(source) ? undefined : true,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'import.meta.env.MODE': JSON.stringify('production'),
    'import.meta.env': JSON.stringify({ MODE: 'production' }),
  },
  plugins: [{
    name: 'dsh-skin-market-css',
    resolveId(source, importer) {
      if (!source.endsWith('.module.css')) return null
      return `${cssPrefix}${resolve(dirname(importer ?? ''), source)}${cssSuffix}`
    },
    async load(virtualId) {
      if (!virtualId.startsWith(cssPrefix)) return null
      const file = virtualId.slice(cssPrefix.length, -cssSuffix.length)
      this.addWatchFile(file)
      const result = transform({
        filename: file,
        code: await readFile(file),
        cssModules: { pattern: '[hash]_[local]' },
        minify: true,
        targets: { chrome: 105 << 16, firefox: 121 << 16, safari: 17 << 16, edge: 105 << 16 },
      })
      const classes: Record<string, string> = {}
      for (const [key, value] of Object.entries(result.exports ?? {})) classes[key] = value.name
      return [
        `const css=${JSON.stringify(result.code.toString())};`,
        `const tagId=${JSON.stringify(`${id}/${basename(file)}`)};`,
        `if(typeof document!=="undefined"&&!document.querySelector("style[data-plugin-css="+JSON.stringify(tagId)+"]")){`,
        `const tag=document.createElement("style");tag.dataset.plugin=${JSON.stringify(id)};tag.dataset.pluginCss=tagId;tag.textContent=css;document.head.appendChild(tag);}`,
        `export default ${JSON.stringify(classes)};`,
      ].join('\n')
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
