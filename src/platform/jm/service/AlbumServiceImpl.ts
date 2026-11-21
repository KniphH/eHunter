/**
 * 禁漫天堂（18comic / jmcomic 系列镜像）。
 *
 * 两个麻烦点：
 *
 * 1. 图片是 **scramble 混淆**的。`<img>` 里的地址指向乱序切块的原图，
 *    必须按 md5(aid + 页码) 算出的块数倒序重排（见 ../scramble.ts）。
 *
 * 2. 页面有反广告拦截：adblockPhotoConfig.replacePercent = 60，
 *    检测到拦截时会把 60% 的图换成广告图。本插件不拦广告，正常不受影响。
 *
 * 性能取舍：**不在 init 里预处理全部图片**。
 * 串行下载 + 还原 30 页要等半分钟才看得到第一页，而站点本身加载很快。
 * 这里只在真正要显示某页时（getImgSrc）才下载并还原那一页，结果缓存复用。
 */

import type { AlbumService } from '../../../../core/service/AlbumService'
import type { ImgPageInfo, ThumbInfo, PreviewThumbnailStyle, ImgSrcMode } from '../../../../core/model/model'
import { ThumbMode } from '../../../../core/model/model'
import type { InitializationStepUpdate } from '../../types'
import { JM_INITIALIZATION_STEPS, createStepMap, createStepUpdate, markCurrentPendingStepFailed } from '../../init-steps'
import { fetchImageBlob } from '../../../../core/service/ImageFetchService'
import { getBlockCount, unscrambleToBlob } from '../scramble'
import Logger from '../../../../core/utils/logger'

declare const unsafeWindow: Window & Record<string, unknown> | undefined

/** 还没拿到真实尺寸时的兜底比例（高 / 宽） */
const FALLBACK_HEIGHT_OF_WIDTH = 1.4

export class JmAlbumServiceImpl implements AlbumService {
  private imgPageInfos: Array<ImgPageInfo> = []
  private thumbInfos: Array<ThumbInfo> = []
  private title = ''
  private albumId = ''
  /** 每页的「页码名」（容器 id 去掉扩展名），算块数要用 */
  private pageNames: string[] = []
  /** 每页的原始地址（打乱的那份） */
  private originalSources: string[] = []
  /** 已还原好的 blob URL：index -> url */
  private resolved = new Map<number, string>()
  /** 同一页正在还原时复用同一个 Promise，避免重复下载 */
  private inflight = new Map<number, Promise<string>>()
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
    return false
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

      // 只登记地址，不下载：真正的下载与还原推迟到要显示某一页时
      const collected: Array<{ src: string, pageName: string }> = []
      for (const container of containers) {
        const img = container.querySelector<HTMLImageElement>('img[id^="album_photo_"]')
        const url = img?.getAttribute('data-original') || img?.getAttribute('src') || ''
        if (!url) {
          continue
        }
        collected.push({ src: url, pageName: (container.id || '').split('.')[0] })
      }
      if (collected.length === 0) {
        const reason = 'Failed to extract page images.'
        this.failCurrentInitializationStep(reason)
        return new Error(reason)
      }

      this.originalSources = collected.map(item => item.src)
      this.pageNames = collected.map(item => item.pageName)
      this.buildPageInfos()
      this.updateInitializationStep(
        createStepUpdate(this.initializationStepMap.renderScrambledPages, 'success', 'on demand'),
      )
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

  /**
   * 按需还原一页。
   *
   * 第一次调用会下载该页并做 scramble 还原（一般几十到几百毫秒），之后命中缓存。
   * 同一页并发调用复用同一个 Promise，不会重复下载。
   */
  async getImgSrc(index: number): Promise<ImgPageInfo | Error> {
    const info = this.imgPageInfos[index]
    if (!info) {
      return new Error(`Image page info not found for index ${index}`)
    }

    const cached = this.resolved.get(index)
    if (cached) {
      return { ...info, src: cached }
    }

    const inflightTask = this.inflight.get(index)
    if (inflightTask) {
      const url = await inflightTask
      return { ...info, src: url }
    }

    const task = this.resolvePage(index)
    this.inflight.set(index, task)
    try {
      const url = await task
      return { ...info, src: url }
    } finally {
      this.inflight.delete(index)
    }
  }

  getPreviewThumbnailStyle(): PreviewThumbnailStyle {
    return {
      'background-image': '',
      'background-position': '',
      'background-size': '',
    }
  }

  dispose(): void {
    for (const url of this.ownUrls) {
      try {
        URL.revokeObjectURL(url)
      } catch {
        // 忽略
      }
    }
    this.ownUrls = []
    this.resolved.clear()
    this.inflight.clear()
  }

  /** 下载 + 还原一页，返回可直接用的 blob URL（失败时退回原地址） */
  private async resolvePage(index: number): Promise<string> {
    const raw = this.originalSources[index]
    if (!raw) {
      return ''
    }
    const aid = readGlobalNumber('aid')
    const pageName = this.pageNames[index] || ''
    const blocks = getBlockCount(aid, pageName)

    try {
      const blob = await fetchImageBlob(raw, 'blob')
      const fixed = await unscrambleToBlob(blob, blocks)
      if (!fixed) {
        return raw
      }
      const url = URL.createObjectURL(fixed)
      this.ownUrls.push(url)
      this.resolved.set(index, url)

      /*
       * 还原后的图尺寸是准的，顺便修正这一页的高宽比。
       * 书页模式按「高度 = 宽度 × 比例」排布并让 img 填满容器，
       * 比例偏小就会被横向拉伸（joyacg / wnacg 都栽在这上面）。
       */
      const size = await probeBlobSize(fixed)
      if (size.width > 0 && size.height > 0) {
        const info = this.imgPageInfos[index]
        if (info) {
          info.heightOfWidth = size.height / size.width
        }
      }
      return url
    } catch (err) {
      Logger.logText('JM', `unscramble failed #${index}: ${String((err as Error)?.message || err)}`)
      return raw
    }
  }

  private buildPageInfos(): void {
    this.imgPageInfos = this.originalSources.map((src, index) => ({
      id: `jm:${index}`,
      index,
      pageUrl: location.href,
      src,
      thumbHeight: 0,
      thumbWidth: 0,
      thumbStyle: '',
      heightOfWidth: FALLBACK_HEIGHT_OF_WIDTH,
    }))
    // 禁漫不给缩略图：整本都是 scramble 图，做缩略图要么是打乱的、要么得逐页还原，不划算
    this.thumbInfos = []
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

/**
 * 读取站点内联脚本里的全局变量（aid / scramble_id）。
 *
 * **必须走 unsafeWindow**：Tampermonkey 沙箱有自己的 window，
 * `window.aid` 读到的是 undefined → 0，分块数就全错了（实测 aid=0 时
 * 切的条数和站点对不上，画面碎成一条一条）。
 */
function readGlobalNumber(name: string): number {
  const unsafe = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : null) as Record<string, unknown> | null
  if (unsafe) {
    const num = Number(unsafe[name])
    if (Number.isFinite(num) && num > 0) {
      return num
    }
  }
  const direct = Number((window as unknown as Record<string, unknown>)[name])
  if (Number.isFinite(direct) && direct > 0) {
    return direct
  }
  const pattern = new RegExp(`var\\s+${name}\\s*=\\s*(\\d+)`)
  for (const script of Array.from(document.querySelectorAll('script'))) {
    const match = pattern.exec(script.textContent || '')
    if (match) {
      const parsed = Number(match[1])
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }
  return 0
}

function readTitle(): string {
  const h1 = document.querySelector('h1')
  const raw = (h1?.textContent || document.title || '').trim()
  return raw.replace(/\s*[-|]\s*禁漫天堂\s*$/i, '').trim()
}

/** 读 blob 的像素尺寸 */
function probeBlobSize(blob: Blob): Promise<{ width: number, height: number }> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    const done = (w: number, h: number): void => {
      img.onload = null
      img.onerror = null
      URL.revokeObjectURL(url)
      resolve({ width: w, height: h })
    }
    img.onload = () => done(img.naturalWidth, img.naturalHeight)
    img.onerror = () => done(0, 0)
    img.src = url
  })
}
