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
         * photos-view-id 没有自己的图片列表，只能逐页走 nextpage。
         * 但它能顺链找到同一本相册的 slide-aid 页面（view-id → index → slide-aid），
         * 那边有完整的 photos-item-aid-*.html 列表——一次请求拿全。
         * 只有整条链都找不到 slide-aid 时，才退回逐页走。
         */
        const slideAid = await this.resolveSlideAid()
        if (slideAid) {
          this.albumId = slideAid
          this.imgListUrl = `/photos-item-aid-${slideAid}.html`
          this.imgListItems = await this.fetchImgList()
        }
        if (this.imgListItems.length === 0) {
          const firstBatch = await this.walkViewPages(INITIAL_WALK_PAGES)
          this.imgListItems = firstBatch.items
          if (firstBatch.nextCursor) {
            void this.continueWalkInBackground(firstBatch.nextCursor)
          }
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
   * 找出这本相册的 slide-aid。
   *
   * photos-view-id-* 页面本身没有图片列表（没有 photos-item-aid-*.html），
   * 只能逐页走 nextpage，31 页就是 31 次串行请求。
   *
   * 但这些页面里带着「相册索引」链接（/photos-index-aid-{x}.html），
   * 索引页里又有「幻灯片阅读」链接（/photos-slide-aid-{y}.html），
   * 而 slide-aid 页面才提供 photos-item-aid-{y}.html 那份完整图片列表。
   *
   * 所以顺着走两步：view-id → index → slide-aid，然后一次把列表拿到。
   * 最多 2 次请求，比 31 次串行快一个数量级。
   */
  private async resolveSlideAid(): Promise<string> {
    const pageHtml = document.documentElement.innerHTML
    const localSlide = /photos-slide-aid-(\d+)\.html/i.exec(pageHtml)
    if (localSlide) {
      return localSlide[1]
    }

    const indexMatch = /photos-index-aid-(\d+)\.html/i.exec(pageHtml)
    if (!indexMatch) {
      return ''
    }
    try {
      const indexHtml = await new TextReq(`/photos-index-aid-${indexMatch[1]}.html`).request()
      const slideMatch = /photos-slide-aid-(\d+)\.html/i.exec(indexHtml)
      if (slideMatch) {
        return slideMatch[1]
      }
    } catch (error) {
      Logger.logText('WNACG', `index page fetch failed: ${String((error as Error)?.message || error)}`)
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
        /*
         * 不再为了拿宽高把整张图下载一遍。
         * 之前每页一次 new Image()，等于把整本漫画又下载了一次——
         * 比例交给显示时的 loaded() 校正就够（那时图已经在内存里）。
         */
        items.push({ url: imgUrl, width: 0, height: 0 })
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

