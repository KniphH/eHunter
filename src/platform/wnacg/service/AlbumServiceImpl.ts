/**
 * WNACG Album Service Implementation
 *
 * Image urls and sizes come from the reader's data script (/photos-item-aid-{aid}.html),
 * title and thumbnails come from the album intro pages (/photos-index-aid-{aid}.html).
 */

import type { AlbumService } from '../../../../core/service/AlbumService'
import type { ImgPageInfo, ThumbInfo, PreviewThumbnailStyle, ImgSrcMode } from '../../../../core/model/model'
import { ThumbMode } from '../../../../core/model/model'
import { ImgListParser, type WnacgImgListItem } from '../parser/ImgListParser'
import { IntroHtmlParser, type WnacgIntroThumb } from '../parser/IntroHtmlParser'
import { TextReq } from '../../base/request/TextReq'
import Logger from '../../../../core/utils/logger'
import type { InitializationStepUpdate } from '../../types'
import {
  WNACG_INITIALIZATION_STEPS,
  createStepMap,
  createStepUpdate,
  markCurrentPendingStepFailed
} from '../../init-steps'

const DEFAULT_HEIGHT_OF_WIDTH = 1.4
const THUMB_BASE_WIDTH = 200
const INTRO_PAGE_CONCURRENCY = 3
/** 首屏先扫这么多页，够看到开头就行 */
const INITIAL_WALK_PAGES = 12
/** 后台每批扫这么多页 */
const BACKGROUND_WALK_PAGES = 20
// image urls are signed and expire, a re-request of the same page refreshes the list (at most once per interval)
const IMG_LIST_REFRESH_INTERVAL_MS = 15000

export class WNACGAlbumServiceImpl implements AlbumService {
  private thumbInfos: Array<ThumbInfo> = []
  private imgPageInfos: Array<ImgPageInfo> = []
  private imgListItems: Array<WnacgImgListItem> = []
  private pageCount: number = 0
  private introUrl: string = ''
  private imgListUrl: string = ''
  private albumId: string = ''
  private title: string = ''
  private servedImgIndexes: Set<number> = new Set()
  private imgListRefreshing: Promise<void> | null = null
  private imgListRefreshedAt: number = 0
  private reportInitializationStep: (step: InitializationStepUpdate) => void = () => {}
  private pageCountListener: (() => void) | null = null
  private initializationStepStatus: Record<string, InitializationStepUpdate['status']> = {}
  private readonly initializationStepOrder = WNACG_INITIALIZATION_STEPS.map(step => step.id)
  private readonly initializationStepMap = createStepMap(WNACG_INITIALIZATION_STEPS)

  isSupportOriginImg(): boolean {
    return false
  }

  isSupportImgChangeSource(): boolean {
    return false
  }

  isSupportThumbView(): boolean {
    return true
  }

  getTitle(): string {
    return this.title
  }

  getAlbumId(): string {
    return this.albumId
  }

  getIntroUrl(): string {
    return this.introUrl
  }

  getPageCount(): number {
    return this.pageCount
  }

  getCurPageIndex(): number {
    return 0
  }

  setInitializationStepReporter(reporter: (step: InitializationStepUpdate) => void): void {
    this.reportInitializationStep = reporter
  }

  setPageCountListener(listener: () => void): void {
    this.pageCountListener = listener
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
      step => this.updateInitializationStep(step)
    )
  }

  async init(): Promise<Error | void> {
    this.initializationStepStatus = {}
    WNACG_INITIALIZATION_STEPS.forEach(step => {
      this.updateInitializationStep(createStepUpdate(step, 'pending'))
    })

    try {
      // 两种阅读页路径都带 aid 或 view-id 后的数字
      const aidMatch = window.location.pathname.match(/(?:aid|view-id)-(\d+)/)
      if (!aidMatch) {
        throw new Error('Album id not found in url')
      }
      this.albumId = aidMatch[1]
      this.introUrl = `${window.location.origin}/photos-index-aid-${this.albumId}.html`
      const itemScript = document.querySelector('script[src*="photos-item-aid-"]')
      this.imgListUrl = itemScript?.getAttribute('src') || `/photos-item-aid-${this.albumId}.html`
      this.updateInitializationStep(
        createStepUpdate(
          this.initializationStepMap.parseImagePageMetadata,
          'success',
          `Album ${this.albumId}`
        )
      )

      /*
       * photos-view-id-* 是「整本视图」：图片直接排在页面里，
       * 服务器不提供 photos-item-aid-*.html 列表（请求会 404）。
       * 这类页面从 DOM 取图；photos-slide-aid-* 才走那个列表脚本。
       */
      const isViewMode = /\/photos-view-id-/.test(window.location.pathname)
      if (isViewMode) {
        /*
         * 整本视图是**逐页导航**：每一页是一个独立 HTML（…/photos-view-id-xxxxx.html），
         * 页 id 不连号，页面里只有 prevpage / nextpage 两个变量指向相邻页。
         * 所以必须从当前页沿 nextpage 一路走到底，把每页的 #picarea 图片收起来。
         */
        const firstBatch = await this.walkViewPages(INITIAL_WALK_PAGES)
        this.imgListItems = firstBatch.items
        if (this.imgListItems.length === 0) {
          throw new Error('No images found on this page.')
        }
        // 先把首屏交出去，剩余页在后台继续沿链走，扫到就更新页数
        if (firstBatch.nextCursor) {
          void this.continueWalkInBackground(firstBatch.nextCursor)
        }
        this.updateInitializationStep(
          createStepUpdate(
            this.initializationStepMap.fetchImageList,
            'success',
            `${this.imgListItems.length} pages (walked)`
          )
        )
      } else {
        this.imgListItems = await this.fetchImgList()
      }
      this.pageCount = this.imgListItems.length
      this.imgListRefreshedAt = Date.now()
      this.updateInitializationStep(
        createStepUpdate(
          this.initializationStepMap.fetchImageList,
          'success',
          `${this.pageCount} pages detected`
        )
      )

      const introThumbs = await this.fetchIntroThumbs()
      if (!this.title) {
        this.title = getTitleFromDocument()
      }
      if (!this.title) {
        throw new Error('Title is empty')
      }
      const thumbCount = introThumbs.filter(thumb => thumb && thumb.thumbSrc).length
      this.updateInitializationStep(
        createStepUpdate(
          this.initializationStepMap.fetchIntroPages,
          'success',
          `${thumbCount}/${this.pageCount} thumbnails loaded`
        )
      )

      this.buildPageInfos(introThumbs)
      this.updateInitializationStep(
        createStepUpdate(
          this.initializationStepMap.extractImagePagesAndThumbnails,
          'success',
          `${this.imgPageInfos.length} image pages and ${this.thumbInfos.length} thumbnails extracted`
        )
      )
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      this.failCurrentInitializationStep(reason)
      return error instanceof Error ? error : new Error(String(error))
    }
  }

  /**
   * 整本视图逐页抓取。
   *
   * 每一页是独立 HTML，页 id 不连号，靠页面里的 `var nextpage = "..."` 串起来。
   * 从当前页开始沿链走，每页取 `#picarea` 的图片地址，直到没有 nextpage。
   * 上限 500 页，防止异常数据把请求打爆。
   */
  /**
   * 从当前文档里找相册 aid。
   *
   * view-id 页面本身带 /photos-index-aid-{aid}.html 这样的链接（面包屑/返回），
   * 抠出其中的数字即可。拿到真正的 aid 后就能一次请求图片列表，
   * 不必沿 nextpage 逐页走。
   */
  private readAidFromDocument(): string {
    const html = document.documentElement.innerHTML
    const patterns = [
      /photos-index-aid-(\d+)\.html/i,
      /photos-item-aid-(\d+)\.html/i,
      /photos-slide-aid-(\d+)\.html/i,
      /aid-(\d+)/i,
    ]
    for (const pattern of patterns) {
      const match = pattern.exec(html)
      if (match) {
        return match[1]
      }
    }
    return ''
  }

  /**
   * 沿 nextpage 链逐页抓取。
   *
   * 页面之间靠 `var nextpage` 串起来，页 id 不连号，所以没法并发——只能一页一页走。
   * 整本 30 页就是 30 次串行请求，首屏要等好几秒。
   * 因此传入 limit：初始化只扫前几页，先让用户看到内容，剩下的在后台继续补。
   */
  private async walkViewPages(limit = 500, startCursor?: string): Promise<{ items: Array<WnacgImgListItem>, nextCursor: string | null }> {
    const items: Array<WnacgImgListItem> = []
    const seenPages = new Set<string>()
    let cursor: string | null = startCursor || location.href
    let guard = 0
    let consumed = 0

    while (cursor && guard < 500) {
      if (consumed >= limit) {
        return { items, nextCursor: cursor }
      }
      consumed++
      guard++
      if (seenPages.has(cursor)) {
        break
      }
      seenPages.add(cursor)

      let htmlText = ''
      if (cursor === location.href) {
        htmlText = document.documentElement.outerHTML
      } else {
        htmlText = await new TextReq(cursor, true).request()
      }

      const imgUrl = this.parseViewPageImage(htmlText)
      if (imgUrl) {
        const size = await probeImageSize(imgUrl)
        items.push({ url: imgUrl, width: size.width, height: size.height })
      }

      const nextUrl = this.parseViewPageNext(htmlText)
      cursor = nextUrl && nextUrl !== cursor ? nextUrl : null
    }

    return { items, nextCursor: null }
  }

  /**
   * 后台继续把剩下的页扫完。
   *
   * 每扫一批就更新 imgListItems / pageCount，UI 会跟着长出来。
   * 失败就停下，不影响已经显示的部分。
   */
  private async continueWalkInBackground(cursor: string): Promise<void> {
    let nextCursor: string | null = cursor
    while (nextCursor) {
      try {
        const batch = await this.walkViewPages(BACKGROUND_WALK_PAGES, nextCursor)
        if (batch.items.length === 0) {
          break
        }
        this.imgListItems = [...this.imgListItems, ...batch.items]
        this.pageCount = this.imgListItems.length
        this.buildPageInfos([])
        // 通知上层把新的页数写进 store，否则界面还停在首屏那 12 页
        this.pageCountListener?.()
        nextCursor = batch.nextCursor
      } catch (error) {
        Logger.logText('WNACG', `background walk stopped: ${String((error as Error)?.message || error)}`)
        break
      }
    }
  }

  /** 从单个 view 页的 HTML 里取图片地址：优先 #picarea，其次 .photo */
  private parseViewPageImage(htmlText: string): string {
    const picarea = /<img[^>]*id=["']picarea["'][^>]*>/i.exec(htmlText)
      || /<img[^>]*class=["'][^"']*photo[^"']*["'][^>]*>/i.exec(htmlText)
    const tag = picarea ? picarea[0] : ''
    const srcMatch = tag ? /src=["']([^"']+)["']/i.exec(tag) : null
    const raw = srcMatch ? srcMatch[1] : ''
    if (!raw || raw.startsWith('data:')) {
      return ''
    }
    try {
      return raw.startsWith('//') ? `https:${raw}` : new URL(raw, location.href).href
    } catch {
      return ''
    }
  }

  /** 从单个 view 页的 HTML 里取下一页地址 */
  private parseViewPageNext(htmlText: string): string {
    const match = /var\s+nextpage\s*=\s*["']([^"']+)["']/i.exec(htmlText)
    const raw = match ? match[1] : ''
    if (!raw || raw === '#' || raw === '') {
      return ''
    }
    try {
      return raw.startsWith('//') ? `https:${raw}` : new URL(raw, location.href).href
    } catch {
      return ''
    }
  }

  private async fetchImgList(noCache = false): Promise<Array<WnacgImgListItem>> {
    const text = await new TextReq(this.imgListUrl, noCache).request()
    return new ImgListParser(text).getItems()
  }

  // thumbnails are split into several intro pages; a failed page only loses its thumbnails
  private async fetchIntroThumbs(): Promise<Array<WnacgIntroThumb | undefined>> {
    const result: Array<WnacgIntroThumb | undefined> = []
    let firstPage: IntroHtmlParser
    try {
      firstPage = new IntroHtmlParser(await new TextReq(this.introUrl).request())
    } catch (error) {
      console.error('eHunter: failed to fetch wnacg intro page', error)
      return result
    }
    this.title = firstPage.getTitle()
    const thumbsPerPage = firstPage.getThumbs()
    result.push(...thumbsPerPage)
    if (thumbsPerPage.length === 0) {
      return result
    }

    const introPageCount = Math.ceil(this.pageCount / thumbsPerPage.length)
    const pendingPages: Array<number> = []
    for (let page = 2; page <= introPageCount; page++) {
      pendingPages.push(page)
    }
    const worker = async () => {
      while (pendingPages.length > 0) {
        const page = pendingPages.shift()!
        try {
          const html = await new TextReq(`/photos-index-page-${page}-aid-${this.albumId}.html`).request()
          new IntroHtmlParser(html).getThumbs().forEach((thumb, i) => {
            result[(page - 1) * thumbsPerPage.length + i] = thumb
          })
        } catch (error) {
          console.error(`eHunter: failed to fetch wnacg intro page ${page}`, error)
        }
      }
    }
    await Promise.all(Array.from({ length: INTRO_PAGE_CONCURRENCY }, () => worker()))
    return result
  }

  private buildPageInfos(introThumbs: Array<WnacgIntroThumb | undefined>): void {
    this.imgPageInfos = []
    this.thumbInfos = []
    this.imgListItems.forEach((item, index) => {
      const heightOfWidth = item.width > 0 && item.height > 0
        ? item.height / item.width
        : DEFAULT_HEIGHT_OF_WIDTH
      const introThumb = introThumbs[index]
      this.imgPageInfos.push({
        id: index,
        index,
        pageUrl: introThumb?.pageUrl || window.location.href,
        src: '',
        heightOfWidth
      })
      this.thumbInfos.push({
        id: index,
        mode: ThumbMode.IMG,
        // fall back to the full image when the intro page of this thumbnail failed
        src: introThumb?.thumbSrc || item.url,
        width: THUMB_BASE_WIDTH,
        height: Math.round(THUMB_BASE_WIDTH * heightOfWidth)
      })
    })
  }

  private async refreshImgList(): Promise<void> {
    if (Date.now() - this.imgListRefreshedAt < IMG_LIST_REFRESH_INTERVAL_MS) {
      return
    }
    if (!this.imgListRefreshing) {
      this.imgListRefreshing = (async () => {
        try {
          const items = await this.fetchImgList(true)
          if (items.length === this.imgListItems.length) {
            this.imgListItems = items
          }
          this.imgListRefreshedAt = Date.now()
        } finally {
          this.imgListRefreshing = null
        }
      })()
    }
    await this.imgListRefreshing
  }

  getThumbInfos(isDisableCache: boolean): Array<ThumbInfo> {
    return this.thumbInfos
  }

  getImgPageInfos(): Array<ImgPageInfo> {
    return this.imgPageInfos
  }

  async getImgSrc(index: number, mode: ImgSrcMode): Promise<ImgPageInfo | Error> {
    try {
      const imgPageInfo = this.imgPageInfos[index]
      if (!imgPageInfo) {
        return new Error(`Image page info not found for index ${index}`)
      }

      // a second request of the same page means its last url failed to load
      if (this.servedImgIndexes.has(index)) {
        await this.refreshImgList()
      }
      this.servedImgIndexes.add(index)

      const item = this.imgListItems[index]
      imgPageInfo.src = item.url
      if (item.width > 0 && item.height > 0) {
        imgPageInfo.preciseHeightOfWidth = item.height / item.width
      }
      return { ...imgPageInfo }
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error))
    }
  }

  getPreviewThumbnailStyle(index: number): PreviewThumbnailStyle {
    const thumbInfo = this.thumbInfos[index]

    return {
      'background-image': thumbInfo?.src ? `url(${thumbInfo.src})` : '',
      'background-position': '0% 0%',
      'background-size': 'cover'
    }
  }
}

// e.g. "[作者] 標題 - 列表 - 紳士漫畫-專註分享漢化本子|邪惡漫畫"
function getTitleFromDocument(): string {
  return document.title.replace(/\s+-\s+列表\s+-\s+[\s\S]*$/, '').trim()
}

/**
 * 探测一张图的真实尺寸。
 *
 * wnacg 整本视图的页面里没有 width/height 属性，也没有尺寸数据，
 * 而书页模式是「高度 = 宽度 × 高宽比」并把图片拉伸填满容器——
 * 比例不准就会像之前那样被横向拉宽。所以这里真的把图加载一次拿尺寸。
 * 失败时返回 0/0，调用方会退回默认比例。
 */
function probeImageSize(url: string): Promise<{ width: number, height: number }> {
  return new Promise(resolve => {
    const img = new Image()
    const done = (w: number, h: number): void => {
      img.onload = null
      img.onerror = null
      resolve({ width: w, height: h })
    }
    img.onload = () => done(img.naturalWidth, img.naturalHeight)
    img.onerror = () => done(0, 0)
    // 加超时兜底，避免个别图片挂住整个初始化
    window.setTimeout(() => done(0, 0), 8000)
    img.src = url
  })
}
