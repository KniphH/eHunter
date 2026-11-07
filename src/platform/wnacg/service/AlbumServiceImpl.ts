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
      const aidMatch = window.location.pathname.match(/aid-(\d+)/)
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

      this.imgListItems = await this.fetchImgList()
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
