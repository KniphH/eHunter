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
// @match        https://wnacg.ru/*
// @match        https://*.wnacg.ru/*
// @match        https://wnacg.net/*
// @match        https://*.wnacg.net/*
// @match        https://wnacg.org/*
// @match        https://*.wnacg.org/*
// @match        https://18comic.vip/*
// @match        https://18comic.ink/*
// @match        https://jmcomic-zzz.one/*
// @match        https://jmcomic-zzz.org/*
// @match        https://comic18j-susu.com/*
// @match        https://comic18j-nico.work/*
// @match        https://comic18j-neo.com/*
// @match        https://joyacg.cc/*
// @match        https://joyacg.top/*
// @connect      hath.network
// @connect      nhentai.net
// @connect      wnacg.com
// @connect      wnacg.ru
// @connect      wnacg.net
// @connect      wnacg.org
// @connect      joyacg.cc
// @connect      joyacg.top
// @connect      cdn-msp.18comic.vip
// @connect      cdn-msp2.18comic.vip
// @connect      cdn-msp3.18comic.vip
// @connect      18comic.vip
// @connect      i0.wp.com
// @connect      i1.wp.com
// @connect      i2.wp.com
// @connect      i3.wp.com
// @connect      qy0.ru
// @connect      www.pixiv.net
// @connect      pixiv.net
// @connect      i.pximg.net
// @connect      githubusercontent.com
// @connect      jp.animesales.xyz
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
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
  plugins: [vue(), cssInjectedByJsPlugin({
    /*
     * 不往 <head> 里插样式：插件跑在 Shadow DOM 里，样式必须在 shadow root
     * 内才生效，而且这样才能彻底隔绝宿主站点的影响。
     * 这里只把 CSS 字符串暂存到全局，由 main.ts 在建好 shadow 后写入。
     */
    injectCodeFunction: function (cssCode: string) {
      if (typeof window !== 'object') {
        return
      }
      const w = window as unknown as Record<string, unknown>
      w.__EHUNTER_CSS__ = String(w.__EHUNTER_CSS__ || '') + cssCode
    },
  }), svgLoader(), prependUserscriptBannerPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    __EHUNTER_VERSION__: JSON.stringify(pkg.version),
    // 本地时间 MM-DD HH:mm，用来一眼确认装的是哪次构建
    // 显式用东八区：构建机的 node 时区不一定和浏览器一致
    __BUILD_STAMP__: JSON.stringify(new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date()).replace('/', '-'))
  },
  appType: 'custom',
  server: {
    host: true,
    middlewareMode: true,
  },
  build: {
    target: 'es2020',
    modulePreload: false,
    lib: { // add 30kb size
      entry: './src/main.ts',
      name: 'ehunter',
      formats: ['iife'],
      fileName: 'ehunter'
    }
  }
})
