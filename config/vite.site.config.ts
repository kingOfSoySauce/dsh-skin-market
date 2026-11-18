import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, createReadStream, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const catalogFile = resolve('data/catalog.json')
const curvesFile = resolve('data/star-curves.json')
const dataFiles = new Map([
  ['/catalog.json', catalogFile],
  ['/dsh-skin-market/catalog.json', catalogFile],
  ['/star-curves.json', curvesFile],
  ['/dsh-skin-market/star-curves.json', curvesFile],
])

export default defineConfig({
  root: 'site',
  base: '/dsh-skin-market/',
  plugins: [react(), {
    name: 'publish-live-catalog',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
        const file = dataFiles.get(pathname)
        if (file === undefined) return next()
        if (!existsSync(file)) { response.statusCode = 404; response.end(); return }
        response.setHeader('content-type', 'application/json; charset=utf-8')
        response.setHeader('cache-control', 'no-store')
        createReadStream(file).pipe(response)
      })
    },
    closeBundle() {
      copyFileSync(catalogFile, resolve('dist-site/catalog.json'))
      if (existsSync(curvesFile)) copyFileSync(curvesFile, resolve('dist-site/star-curves.json'))
    },
  }],
  server: { host: '0.0.0.0', allowedHosts: ['terminal.local'] },
  build: { outDir: '../dist-site', emptyOutDir: true },
})
