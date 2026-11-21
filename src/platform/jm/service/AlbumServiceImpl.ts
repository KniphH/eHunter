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
import Logger from '../../../../core/utils/logger'
import { JM_INITIALIZATION_STEPS, createStepMap, createStepUpdate, markCurrentPendingStepFailed } from '../../init-steps'
import { fetchImageBlob } from '../../../../core/service/ImageFetchService'
import { getBlockCount, unscrambleToBlob } from '../scramble'

declare const unsafeWindow: Window & Record<string, unknown> | undefined

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

      const aid = readGlobalNumber('aid')
      Logger.logText('JM', `aid=${aid} pages=${containers.length}`)

      // 自己下载并还原：页面上只有滚进视口的图才有 canvas，不能依赖它
      const sources = await this.buildSources(containers)
      this.updateInitializationStep(createStepUpdate(this.initializationStepMap.renderScrambledPages, 'success'))
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

  /**
   * 逐页下载打乱的图，按块数倒序还原，产出一串 blob URL。
   *
   * 不并发是因为同时解码 30 张 1280x1807 的图很容易把移动端内存打满；
   * 串行虽然慢些，但每张处理完就能释放中间 canvas。
   */
  private async buildSources(containers: HTMLElement[]): Promise<string[]> {
    const defaultAid = readGlobalNumber('aid')
    const total = containers.length
    const result: string[] = []

    for (let i = 0; i < total; i++) {
      const container = containers[i]
      const img = container.querySelector<HTMLImageElement>('img[id^="album_photo_"]')
        || Array.from(document.querySelectorAll<HTMLImageElement>('img[id^="album_photo_"]'))[i]
      const url = img?.getAttribute('data-original') || img?.getAttribute('src') || ''
      if (!url) {
        continue
      }
      /*
       * 块数逐页不同：站点用「章节 aid + 页码(id 里 '.' 前的部分)」算。
       * 章节 aid 优先取 img 上的 data-chapter-aid。
       */
      const chapterAid = Number(img?.getAttribute('data-chapter-aid')) || defaultAid
      const pageName = (container.id || '').split('.')[0]
      const blocks = getBlockCount(chapterAid, pageName)
      try {
        const raw = await fetchImageBlob(url, 'blob')
        const fixed = await unscrambleToBlob(raw, blocks)
        if (fixed) {
          const objectUrl = URL.createObjectURL(fixed)
          this.ownUrls.push(objectUrl)
          result.push(objectUrl)
        } else {
          result.push(url)
        }
      } catch (err) {
        Logger.logText('JM', `unscramble failed ${url}: ${String((err as Error)?.message || err)}`)
        result.push(url)
      }
      if (i % 3 === 0 || i === total - 1) {
        this.updateInitializationStep(
          createStepUpdate(this.initializationStepMap.renderScrambledPages, 'pending', `${i + 1}/${total}`),
        )
      }
    }
    return result
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

/**
 * 读取站点内联脚本里的全局变量（aid / scramble_id）。
 *
 * **必须走 unsafeWindow**：Tampermonkey 的沙箱有自己的 window，
 * `window.aid` 读到的是 undefined → 0，分块数就全错了（实测 aid=0 导致
 * 切的条数和站点对不上，画面碎成一条一条）。
 * 拿不到 unsafeWindow 时退回解析页面里的 `var aid = 1210177;` 文本。
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
  // 最后兜底：从内联脚本文本里抠 "var aid = 1210177;"
  const pattern = new RegExp(`var\s+${name}\s*=\s*(\d+)`)
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




