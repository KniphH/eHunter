import type { ImgPageInfo, ThumbInfo, PreviewThumbnailStyle, ImgSrcMode } from '../model/model'

export const NameAlbumService = 'album_service'

export interface AlbumService {
    isSupportOriginImg(): boolean
    isSupportImgChangeSource(): boolean
    isSupportThumbView(): boolean

    getTitle(): string
    getAlbumId(): string
    getIntroUrl(): string
    getPageCount(): number  
    getCurPageIndex(): number

    init(): Promise<Error | void>

    getThumbInfos(isDisableCache: boolean): Array<ThumbInfo>
    getImgPageInfos(): Array<ImgPageInfo>
    getImgSrc(index: number, mode: ImgSrcMode): Promise<ImgPageInfo | Error>

    /**
     * 丢掉这一页缓存的图片地址，让下一次取址真正重新拉取图片页。
     *
     * 有的平台（eh）命中缓存就直接返回老地址、不再请求页面。当地址解析出来的是
     * 别的图（比如多页拼版预览图）时，不做失效的话重试永远拿回同一个坏地址。
     * 平台没有这层缓存就可以不实现。
     */
    invalidateImgSrc?(index: number): void
    
    getPreviewThumbnailStyle(index: number): PreviewThumbnailStyle 
}
