/**
 * NH Album Service Implementation
 *
 * Ported from legacy NH service behavior and adapted to the current
 * AlbumService interface.
 */

import type { AlbumService } from '../../../../core/service/AlbumService'
import type { ImgPageInfo, ThumbInfo, PreviewThumbnailStyle, ImgSrcMode } from '../../../../core/model/model'
import { ImgHtmlParser } from '../parser/ImgHtmlParser'
import { IntroHtmlParser } from '../parser/IntroHtmlParser'
import { TextReq } from '../../base/request/TextReq'
import type { InitializationStepUpdate } from '../../types'
import {
  NH_INITIALIZATION_STEPS,
  createStepMap,
  createStepUpdate,
  markCurrentPendingStepFailed
} from '../../init-steps'
import { isCloudflareChallengeDocument } from '../../cloudflare'
import { openCloudflareChallenge } from '../../../../core/store/challenge'

export class NHAlbumServiceImpl implements AlbumService {
  private imgHtmlParser: ImgHtmlParser
  private thumbInfos: Array<ThumbInfo> = []
  private imgPageInfos: Array<ImgPageInfo> = []
  private pageCount: number = 0
  private introUrl: string = ''
  private albumId: string = ''
  private curPageIndex: number = 0
  private title: string = ''
  private reportInitializationStep: (step: InitializationStepUpdate) => void = () => {}
  private initializationStepStatus: Record<string, InitializationStepUpdate['status']> = {}
  private readonly initializationStepOrder = NH_INITIALIZATION_STEPS.map(step => step.id)
  private readonly initializationStepMap = createStepMap(NH_INITIALIZATION_STEPS)

  constructor() {
    const htmlText = document.documentElement.outerHTML
    this.imgHtmlParser = new ImgHtmlParser(htmlText)
  }

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
    return this.curPageIndex
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
    NH_INITIALIZATION_STEPS.forEach(step => {
      this.updateInitializationStep(createStepUpdate(step, 'pending'))
    })

    /**
     * 整页是 Cloudflare 的验证页时，页面上根本没有 .num-pages / #image-container
     * 这些结构，继续解析只会抛 `Cannot read properties of null`，用户看到一句
     * 无从下手的报错。这里先拦下来，把验证界面交给覆盖层（内嵌 iframe），
     * 用户就地完成验证后页面会自动重载。
     */
    if (isCloudflareChallengeDocument()) {
      openCloudflareChallenge(window.location.href)
      const reason = 'Blocked by Cloudflare verification. Complete it in the dialog.'
      this.failCurrentInitializationStep(reason)
      return new Error(reason)
    }

    try {
      this.pageCount = this.imgHtmlParser.getPageCount()
      this.albumId = this.imgHtmlParser.getAlbumId()
      this.introUrl = this.imgHtmlParser.getIntroUrl()
      this.curPageIndex = this.imgHtmlParser.getCurPageNum() - 1
      this.updateInitializationStep(
        createStepUpdate(
          this.initializationStepMap.parseImagePageMetadata,
          'success',
          `${this.pageCount} pages detected`
        )
      )

      const introHtml = await new TextReq(this.introUrl).request()
      this.updateInitializationStep(
        createStepUpdate(
          this.initializationStepMap.fetchIntroPage,
          'success',
          'Intro page loaded'
        )
      )
      const introParser = new IntroHtmlParser(introHtml)

      this.title = introParser.getTitle()
      if (!this.title || !this.title.trim()) {
        throw new Error('Title is empty')
      }
      this.updateInitializationStep(
        createStepUpdate(
          this.initializationStepMap.extractTitle,
          'success',
          'Title extracted successfully'
        )
      )

      this.imgPageInfos = introParser.getImgPageInfos()
      this.thumbInfos = introParser.getThumbInfos()
      this.updateInitializationStep(
        createStepUpdate(
          this.initializationStepMap.extractImagePagesAndThumbnails,
          'success',
          `${this.imgPageInfos.length} image pages and ${this.thumbInfos.length} thumbnails extracted`
        )
      )
    } catch (error) {
      let reason = error instanceof Error ? error.message : String(error)
      /**
       * nhentai 前面挂了 Cloudflare。浏览器地址栏那一次能过（它执行了 JS 挑战），
       * 但脚本发出的请求会被当成「非导航请求」单独挑战，直接回 403 的挑战页。
       * 光看「403」用户没法判断该怎么办，这里补一句可操作的建议。
       */
      if (/\b403\b/.test(reason)) {
        reason += ' | Blocked by Cloudflare. Try switching network node / turning off VPN, or open this page in the browser once and reload.'
      }
      this.failCurrentInitializationStep(reason)
      return new Error(reason)
    }
  }

  getThumbInfos(isDisableCache: boolean): Array<ThumbInfo> {
    return this.thumbInfos
  }

  getImgPageInfos(): Array<ImgPageInfo> {
    return this.imgPageInfos
  }

  /** 清掉缓存的地址，否则下面命中 `imgPageInfo.src` 就直接返回，重试拿不回新地址 */
  invalidateImgSrc(index: number): void {
    const info = this.imgPageInfos[index]
    if (info) {
      info.src = ''
    }
  }

  async getImgSrc(index: number, mode: ImgSrcMode): Promise<ImgPageInfo | Error> {
    try {
      const imgPageInfo = this.imgPageInfos[index]
      if (!imgPageInfo) {
        return new Error(`Image page info not found for index ${index}`)
      }

      if (imgPageInfo.src) {
        return { ...imgPageInfo }
      }

      const req = new TextReq(imgPageInfo.pageUrl)
      req.setTimeOutTime(5)

      const htmlText = await req.request()
      const parser = new ImgHtmlParser(htmlText)

      const imgUrl = parser.getImgUrl()
      const imgHeight = parser.getImgHeight()
      const imgWidth = parser.getImgWidth()

      this.imgPageInfos[index].src = imgUrl
      if (imgHeight > 0 && imgWidth > 0) {
        this.imgPageInfos[index].preciseHeightOfWidth = imgHeight / imgWidth
      }

      return { ...this.imgPageInfos[index] }
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
