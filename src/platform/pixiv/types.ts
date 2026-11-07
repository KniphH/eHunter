/**
 * Pixiv API Types
 *
 * Shapes returned by the in-page Pixiv AJAX endpoints and by the
 * `meta#meta-preload-data` payload embedded in artwork pages.
 */

export interface PixivImageUrls {
  thumb_mini?: string
  small?: string
  regular?: string
  original?: string
  mini?: string
}

export interface PixivIllust {
  illustId?: string
  id?: string
  illustTitle?: string
  title?: string
  illustType?: number
  pageCount?: number
  width?: number
  height?: number
  urls?: PixivImageUrls
}

/** One entry of `/ajax/illust/:id/pages` */
export interface PixivPage {
  urls?: PixivImageUrls
  width?: number
  height?: number
}

export interface PixivAjaxResponse<T> {
  error?: boolean
  message?: string
  body?: T
}

export interface PixivPreloadData {
  illust?: Record<string, PixivIllust>
}

/**
 * Per-page image candidates, already resolved to concrete URLs.
 *
 * Pixiv serves the same picture at several sizes:
 * - `original` - full resolution (`img-original`)
 * - `regular`  - screen-sized master copy (`img-master`, ~1200px)
 * - `thumb`    - small thumbnail, used by the thumbnail bar / quick preview
 */
export interface PixivPageImages {
  original: string
  regular: string
  thumb: string
  width: number
  height: number
}
