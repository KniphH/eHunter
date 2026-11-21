/**
 * 禁漫天堂（18comic / jmcomic 系列镜像）。
 *
 * 两个麻烦点：
 *
 * 1. 图片是 **scramble 混淆**的。`<img>` 里的地址指向乱序切块的原图，页面上
 *    真正显示的是旁边那个 `<canvas>` —— 站点自己的 JS 把它还原后画上去。
 *    所以这里直接取 canvas 内容，不自己实现还原算法（算法会变，跟着站点走更稳）。
 *
 * 2. 只有**滚进过视口的页**才会有 canvas。要做到「整本都能翻」，初始化时必须
 *    把页面从头滚一遍触发渲染，再把位置还原回去。
 *
 * 另外站点有反广告拦截：adblockPhotoConfig.replacePercent = 60，检测到拦截时
 * 会把 60% 的图换成广告图。这个插件不拦广告，正常情况不受影响。
 */

import type { AlbumService } from '../../../../core/service/AlbumService'
import type { ImgPageInfo, ThumbInfo, PreviewThumbnailStyle, ImgSrcMode } from '../../../../core/model/model'
import { ThumbMode } from '../../../../core/model/model'
import type { InitializationStepUpdate } from '../../types'
import { JM_INITIALIZATION_STEPS, createStepMap, createStepUpdate, markCurrentPendingStepFailed } from '../../init-steps'

const DEFAULT_HEIGHT_OF_WIDTH = 1.4
const THUMB_BASE_WIDTH = 200
/** 每页停留时间：够触发一次 IntersectionObserver / lazyload */
const SCROLL_STEP_MS = 90
/** 等 canvas 全部生成的耐心上限 */
const RENDER_WAIT_MS = 20000

export class JmAlbumServiceImpl implements AlbumService {
  private imgPageInfos: Array<ImgPageInfo> = []
  private thumbInfos: Array<ThumbInfo> = []
  private title = ''
  private albumId = ''
  /** 自己造的 blob URL，切换作品时要回收 */
  private ownUrls: Array<string> = []
  private reportInitializationStep: (step: InitializationStepUpdate) => void = () => {}
  private initializationStepStatus: Record<string, InitializationStepUpdate['status']> = {}
  private readonly initializationStepOrder = JM_INITIALIZATION_STEPS.map(step => step.id)
  private readonly initializationStepMap = createStepMap(JM_INITIALIZATION_STEPS)

  isSupportOriginImg(): boolean {
    return false
  }

  isSupportImgChangeSource(): boolean {
    return false
  }

  isSupportThumbView(): boolean {
    return this.thumbInfos.length > 0
  }

  getTitle(): string {
    return this.title
  }

  getAlbumId(): string {
    return this.albumId
  }

  getIntroUrl(): string {
    const match = location.pathname.match(/\/photo\/(\d+)/)
    return match ? `${location.origin}/album/${match[1]}/` : location.href
  }

  getPageCount(): number {
    return this.imgPageInfos.length
  }

  getCurPageIndex(): number {
    return 0
  }

  setInitializationStepReporter(reporter: (step: InitializationStepUpdate) => void): void {
    this.reportInitializationStep = reporter
  }

  async init(): Promise<Error | void> {
    this.initializationStepStatus = {}
    JM_INITIALIZATION_STEPS.forEach(step => {
      this.updateInitializationStep(createStepUpdate(step, 'pending'))
    })

    try {
      this.albumId = (location.pathname.match(/\/photo\/(\d+)/) || [])[1] || 'jm'
      const containers = Array.from(document.querySelectorAll<HTMLElement>('.scramble-page'))
      if (containers.length === 0) {
        const reason = 'No comic pages found. If the site shows a verification page, finish it and reload.'
        this.failCurrentInitializationStep(reason)
        return new Error(reason)
      }

      this.title = readTitle()
      this.updateInitializationStep(
        createStepUpdate(this.initializationStepMap.parseImagePageMetadata, 'success', `${containers.length} pages`),
      )

      // 让每一页都进入视口，触发站点的 scramble 还原
      await renderAllPages(containers)
      this.updateInitializationStep(createStepUpdate(this.initializationStepMap.renderScrambledPages, 'success'))

      const sources = await collectPageSources(containers)
      if (sources.length === 0) {
        const reason = 'Failed to extract page images.'
        this.failCurrentInitializationStep(reason)
        return new Error(reason)
      }
      this.buildPageInfos(sources)
      this.updateInitializationStep(
        createStepUpdate(
          this.initializationStepMap.extractImagePagesAndThumbnails,
          'success',
          `${this.imgPageInfos.length} pages`,
        ),
      )
      return
    } catch (err) {
      const reason = (err as Error)?.message || String(err)
      this.failCurrentInitializationStep(reason)
      return err as Error
    }
  }

  getThumbInfos(): Array<ThumbInfo> {
    return this.thumbInfos
  }

  getImgPageInfos(): Array<ImgPageInfo> {
    return this.imgPageInfos
  }

  async getImgSrc(index: number): Promise<ImgPageInfo | Error> {
    const info = this.imgPageInfos[index]
    if (!info) {
      return new Error(`Image page info not found for index ${index}`)
    }
    return { ...info }
  }

  getPreviewThumbnailStyle(): PreviewThumbnailStyle {
    return {
      'background-image': '',
      'background-position': '',
      'background-size': '',
    }
  }

  private buildPageInfos(sources: string[]): void {
    this.imgPageInfos = sources.map((src, index) => ({
      id: `jm:${index}`,
      index,
      pageUrl: location.href,
      src,
      thumbHeight: 0,
      thumbWidth: 0,
      thumbStyle: '',
      heightOfWidth: DEFAULT_HEIGHT_OF_WIDTH,
    }))
    this.thumbInfos = sources.map((src, index) => ({
      id: `jm:thumb:${index}`,
      mode: ThumbMode.IMG,
      src,
      style: '',
      height: 0,
      width: THUMB_BASE_WIDTH,
    }))
  }

  private updateInitializationStep(step: InitializationStepUpdate): void {
    this.initializationStepStatus[step.id] = step.status
    this.reportInitializationStep(step)
  }

  private failCurrentInitializationStep(reason: string): void {
    markCurrentPendingStepFailed(
      this.initializationStepOrder,
      this.initializationStepStatus,
      this.initializationStepMap,
      reason,
      step => this.updateInitializationStep(step),
    )
  }
}

function readTitle(): string {
  const h1 = document.querySelector('h1')
  const raw = (h1?.textContent || document.title || '').trim()
  return raw.replace(/\s*[-|]\s*禁漫天堂\s*$/i, '').trim()
}

/**
 * 把每一页滚进视口，让站点把 scramble 的图画到 canvas 上，最后滚回原处。
 */
async function renderAllPages(containers: HTMLElement[]): Promise<void> {
  const originalY = window.scrollY
  for (const el of containers) {
    el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior })
    await sleep(SCROLL_STEP_MS)
  }

  const deadline = Date.now() + RENDER_WAIT_MS
  while (Date.now() < deadline) {
    const ready = containers.filter(el => el.querySelector('canvas')).length
    if (ready >= containers.length) {
      break
    }
    await sleep(250)
  }

  window.scrollTo({ top: originalY, behavior: 'instant' as ScrollBehavior })
}

/**
 * 按页序取图片来源：优先 canvas（已还原），没有则退回 img.src（可能是乱的）。
 */
async function collectPageSources(containers: HTMLElement[]): Promise<string[]> {
  const result: string[] = []
  for (const container of containers) {
    const canvas = container.querySelector('canvas')
    if (canvas) {
      const blob = await canvasToBlob(canvas)
      if (blob) {
        result.push(URL.createObjectURL(blob))
        continue
      }
    }
    const img = container.querySelector('img')
    const fallback = img?.getAttribute('data-original') || img?.getAttribute('src') || ''
    result.push(fallback)
  }
  return result.filter(Boolean)
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise(resolve => {
    try {
      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob(blob => resolve(blob), 'image/webp', 0.95)
        return
      }
    } catch {
      // 走下面的 dataURL 兜底
    }
    try {
      const dataUrl = canvas.toDataURL('image/png')
      const base64 = dataUrl.split(',')[1] || ''
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      resolve(new Blob([bytes], { type: 'image/png' }))
    } catch {
      resolve(null)
    }
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
