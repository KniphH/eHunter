import { fileURLToPath, URL } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'
import svgLoader from 'vite-svg-loader'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string
}

const userscriptBanner = `// ==UserScript==
// @name         eHunter Enhanced
// @namespace    https://github.com/KniphH/eHunter
// @version      ${pkg.version}
// @description  Enhanced fork of eHunter: scroll/book reader for e-hentai/exhentai/nhentai/pixiv/wnacg with Anime4K super-resolution, output encoding and stats overlay.  eHunter 增强版：卷轴/书本阅读，附超分放大、输出编码与状态浮层.
// @supportURL   https://github.com/KniphH/eHunter/issues
// @author       Alex Chen; enhanced by KniphH
// @match        https://exhentai.org/*
// @match        https://e-hentai.org/*
// @match        https://nhentai.net/*
// @match        https://www.pixiv.net/*
// @match        https://pixiv.net/*
// @match        https://wnacg.com/*
// @match        https://*.wnacg.com/*
// @connect      hath.network
// @connect      nhentai.net
// @connect      wnacg.com
// @connect      qy0.ru
// @connect      www.pixiv.net
// @connect      pixiv.net
// @connect      i.pximg.net
// @connect      githubusercontent.com
// @connect      jp.animesales.xyz
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @license      MIT
// ==/UserScript==`

const prependUserscriptBannerPlugin = (): Plugin => ({
  name: 'prepend-userscript-banner',
  apply: 'build',
  enforce: 'post',
  writeBundle(outputOptions, bundle) {
    const output = bundle['ehunter.iife.js']

    if (!output) {
      return null
    }

    const outputDir = outputOptions.dir ?? 'dist'
    const outputPath = join(outputDir, 'ehunter.iife.js')
    const code = readFileSync(outputPath, 'utf-8')

    if (code.startsWith('// ==UserScript==')) {
      return null
    }

    writeFileSync(outputPath, `${userscriptBanner}\n${code}`, 'utf-8')

    return null
  }
})

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), cssInjectedByJsPlugin(), svgLoader(), prependUserscriptBannerPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    __EHUNTER_VERSION__: JSON.stringify(pkg.version)
  },
  appType: 'custom',
  server: {
    host: true,
    middlewareMode: true,
  },
  build: {
    target: 'es2015',
    modulePreload: false,
    lib: { // add 30kb size
      entry: './src/main.ts',
      name: 'ehunter',
      formats: ['iife'],
      fileName: 'ehunter'
    }
  }
})
