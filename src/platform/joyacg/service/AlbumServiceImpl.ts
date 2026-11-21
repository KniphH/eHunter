/**
 * JoyACG 作品页。
 *
 * 它的作品页（/096528/ 这种纯数字路径）一页就把全部图片铺开，图片走 WordPress
 * 的图片代理（i0.wp.com / i3.wp.com）回源到 nhentai 的 gallery，所以 URL 全在
 * DOM 里，不需要额外请求。未滚到的图片是 loading="lazy"，真实地址在 data-src 上。
 */

import type { AlbumService } from '../../../../core/service/AlbumService'
import type { ImgPageInfo, ThumbInfo, PreviewThumbnailStyle, ImgSrcMode } from '../../../../core/model/model'
import { ThumbMode } from '../../../../core/model/model'
import type { InitializationStepUpdate } from '../../types'
import { JOYACG_INITIALIZATION_STEPS, createStepMap, createStepUpdate, markCurrentPendingStepFailed } from '../../init-steps'

/** 漫画页的比例通常接近 A4；懒加载没解码时先用它占位 */
const DEFAULT_HEIGHT_OF_WIDTH = 1.4
const THUMB_BASE_WIDTH = 200

export class JoyAcgAlbumServiceImpl implements AlbumService {
    private imgPageInfos: Array<ImgPageInfo> = []
    private thumbInfos: Array<ThumbInfo> = []
    private title = ''
    private albumId = ''
    private reportInitializationStep: (step: InitializationStepUpdate) => void = () => {}
    private initializationStepStatus: Record<string, InitializationStepUpdate['status']> = {}
    private readonly initializationStepOrder = JOYACG_INITIALIZATION_STEPS.map(step => step.id)
    private readonly initializationStepMap = createStepMap(JOYACG_INITIALIZATION_STEPS)

    isSupportOriginImg(): boolean {
        return false
    }

    isSupportImgChangeSource(): boolean {
        return false
    }

    /**
     * 不提供缩略图。
     *
     * 缩略图栏一旦展开就固定占 200px；而 joyacg 的图走 wp.com 代理，
     * 缩略图经常加载不出来，于是变成一条空黑栏，把漫画整体推向右。
     * 这里直接不提供，侧栏就不会展开，画面自然居中。
     */
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
        return location.href
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
        JOYACG_INITIALIZATION_STEPS.forEach(step => {
            this.updateInitializationStep(createStepUpdate(step, 'pending'))
        })

        try {
            const title = this.readTitle()
            if (!title) {
                const reason = 'Title not found on this page.'
                this.failCurrentInitializationStep(reason)
                return new Error(reason)
            }
            this.title = title
            this.albumId = location.pathname.replace(/\//g, '') || 'joyacg'
            this.updateInitializationStep(
                createStepUpdate(this.initializationStepMap.parseImagePageMetadata, 'success', title.slice(0, 40)),
            )

            const sources = collectImageSources()
            if (sources.length === 0) {
                const reason = 'No comic images found on this page.'
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

    private readTitle(): string {
        const heading = document.querySelector('h1')
        const text = (heading?.textContent || document.title || '').trim()
        // 站点在 <title> 里加了 " - JoyACG" 后缀，去掉更干净
        return text.replace(/\s*[-|]\s*JoyACG\s*$/i, '').trim()
    }

    private buildPageInfos(sources: string[]): void {
        this.imgPageInfos = sources.map((src, index) => ({
            id: `joyacg:${index}`,
            index,
            pageUrl: location.href,
            src,
            thumbHeight: 0,
            thumbWidth: 0,
            thumbStyle: '',
            heightOfWidth: DEFAULT_HEIGHT_OF_WIDTH,
        }))

        // 不生成缩略图：见 isSupportThumbView 的说明
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
 * 收集正文图片。
 *
 * 只认 nhentai gallery 的路径：站点自己的图标、二维码、以及其它 wp.com 代理的
 * 广告图都在同一批 <img> 里，不加这个过滤会把它们当成漫画页。
 */
function collectImageSources(): string[] {
    const result: string[] = []
    const seen = new Set<string>()
    const imgs = Array.from(document.querySelectorAll('img'))
    for (const img of imgs) {
        const raw = img.getAttribute('data-src') || img.getAttribute('src') || ''
        if (!/nhentai\.net\/galleries\//i.test(raw)) {
            continue
        }
        // 统一去掉 wp.com 代理前缀会是另一套 URL，这里保留原样，直接交给请求层
        const src = raw.startsWith('//') ? `https:${raw}` : raw
        if (seen.has(src)) {
            continue
        }
        seen.add(src)
        result.push(src)
    }
    return result
}
