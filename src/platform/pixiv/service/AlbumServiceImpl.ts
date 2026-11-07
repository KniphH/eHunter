/**
 * Pixiv Album Service Implementation
 *
 * Reads artwork data from the in-page Pixiv AJAX endpoints and falls back to
 * the `meta#meta-preload-data` payload when those endpoints are unavailable.
 *
 * Note on SPA navigation: Pixiv is a single page application, so this script
 * only executes once per full page load. The illust id is therefore resolved
 * inside `init()` instead of the constructor, which keeps the reader in sync
 * when the user navigates from one artwork to another without a reload.
 */

import type { AlbumService } from '../../../../core/service/AlbumService'
import {
  ThumbMode,
  ImgSrcMode,
  type ImgPageInfo,
  type ThumbInfo,
  type PreviewThumbnailStyle
} from '../../../../core/model/model'
import type { InitializationStepUpdate } from '../../types'
import {
  PIXIV_INITIALIZATION_STEPS,
  createStepMap,
  createStepUpdate,
  markCurrentPendingStepFailed
} from '../../init-steps'
import {
  extractIllustId,
  fetchIllust,
  fetchIllustPages,
  readPreloadedIllust,
  resolveTitle,
  toPageImages
} from '../api'
import type { PixivPageImages } from '../types'

/** Fallback aspect ratio, used when the API omits dimensions. */
const DEFAULT_HEIGHT_OF_WIDTH = 1.4

export class PixivAlbumServiceImpl implements AlbumService {
  private thumbInfos: Array<ThumbInfo> = []
  private imgPageInfos: Array<ImgPageInfo> = []
  private pageImages: Array<PixivPageImages> = []
  private pageCount: number = 0
  private introUrl: string = ''
  private albumId: string = ''
  private illustId: string = ''
  private curPageIndex: number = 0
  private title: string = ''
  private reportInitializationStep: (step: InitializationStepUpdate) => void = () => {}
  private initializationStepStatus: Record<string, InitializationStepUpdate['status']> = {}
  private readonly initializationStepOrder = PIXIV_INITIALIZATION_STEPS.map(step => step.id)
  private readonly initializationStepMap = createStepMap(PIXIV_INITIALIZATION_STEPS)

  constructor() {
    this.illustId = extractIllustId(window.location.pathname)
    this.albumId = this.illustId
    this.introUrl = this.buildIntroUrl(this.illustId)
  }

  private buildIntroUrl(illustId: string): string {
    return illustId ? `/artworks/${illustId}` : ''
  }

  /**
   * Pixiv has no separate "original" endpoint - `img-original` is simply one
   * of the sizes the API already hands us, so both modes are supported.
   */
  isSupportOriginImg(): boolean {
    return true
  }

  /**
   * There is no alternate image host to fall back to, but `img-master`
   * (regular) is a lighter copy of the same picture and works as a retry
   * target when the full original fails to load.
   */
  isSupportImgChangeSource(): boolean {
    return true
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
    PIXIV_INITIALIZATION_STEPS.forEach(step => {
      this.updateInitializationStep(createStepUpdate(step, 'pending'))
    })

    try {
      // Re-read the id: the page may have changed since this script loaded.
      this.illustId = extractIllustId(window.location.pathname)
      if (!this.illustId) {
        throw new Error(`Cannot resolve Pixiv illust id from URL: ${window.location.pathname}`)
      }
      this.albumId = this.illustId
      this.introUrl = this.buildIntroUrl(this.illustId)

      const [illust, pages] = await Promise.all([
        fetchIllust(this.illustId),
        fetchIllustPages(this.illustId)
      ])
      const preloadedIllust = readPreloadedIllust(this.illustId)
      const metadata = illust ?? preloadedIllust

      if (!metadata && !pages) {
        throw new Error('Failed to load Pixiv artwork data, please refresh the page and retry')
      }

      this.pageImages = toPageImages(pages, metadata)
      if (!this.pageImages.length) {
        throw new Error(`No image pages found for Pixiv artwork ${this.illustId}`)
      }

      this.pageCount = this.pageImages.length
      this.curPageIndex = 0
      this.updateInitializationStep(
        createStepUpdate(
          this.initializationStepMap.parseImagePageMetadata,
          'success',
          `${this.pageCount} pages detected`
        )
      )

      this.updateInitializationStep(
        createStepUpdate(
          this.initializationStepMap.fetchIntroPage,
          'success',
          'Artwork data loaded'
        )
      )

      this.title = resolveTitle(metadata, document.title || `Pixiv ${this.illustId}`)
      this.updateInitializationStep(
        createStepUpdate(
          this.initializationStepMap.extractTitle,
          'success',
          'Title extracted successfully'
        )
      )

      this.imgPageInfos = this.pageImages.map((images, index) => {
        const heightOfWidth =
          images.width > 0 && images.height > 0
            ? images.height / images.width
            : DEFAULT_HEIGHT_OF_WIDTH

        return {
          id: String(index),
          index,
          pageUrl: `${this.introUrl}#${index + 1}`,
          src: '',
          heightOfWidth,
          preciseHeightOfWidth: heightOfWidth,
          thumbHeight: images.height,
          thumbWidth: images.width,
          thumbStyle: ''
        }
      })

      this.thumbInfos = this.pageImages.map((images, index) => ({
        id: String(index),
        src: images.thumb,
        mode: ThumbMode.IMG,
        style: '',
        height: 0,
        width: 0
      }))

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
      console.error('Pixiv Platform initialization failed:', error)
      return error instanceof Error ? error : new Error(String(error))
    }
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

      const images = this.pageImages[index]
      if (!images) {
        return new Error(`Image candidates not found for index ${index}`)
      }

      let src = ''
      switch (mode) {
        case ImgSrcMode.Origin:
          src = images.original || images.regular
          break

        case ImgSrcMode.Fast:
        case ImgSrcMode.ChangeSource:
          src = images.regular || images.original
          break

        default:
          src = images.original || images.regular
      }

      if (!src) {
        return new Error('ERROR_NO_IMG_URL')
      }

      this.imgPageInfos[index].src = src
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
