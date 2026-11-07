/**
 * Pixiv API
 *
 * All data is read from the same origin the script runs on, so no CORS
 * handling is required and the user's Pixiv session (cookies) is sent
 * automatically - which is what makes R-18 / follower-only works readable.
 */

import { TextReq } from '../base/request/TextReq'
import type {
  PixivAjaxResponse,
  PixivIllust,
  PixivImageUrls,
  PixivPage,
  PixivPageImages,
  PixivPreloadData
} from './types'

/**
 * Matches `/artworks/12345` and the localized `/en/artworks/12345` form.
 * Deliberately not anchored at the end: Pixiv appends query strings and
 * sometimes a trailing slug.
 */
const ILLUST_PATH_PATTERN = /^\/(?:en\/)?artworks\/(\d+)/

export function extractIllustId(pathname: string): string {
  const match = pathname.match(ILLUST_PATH_PATTERN)
  return match ? match[1] : ''
}

async function requestJson<T>(url: string): Promise<PixivAjaxResponse<T> | null> {
  try {
    const req = new TextReq(url)
    req.setTimeOutTime(12)
    req.setRetryTimes(2)
    const text = await req.request()
    return JSON.parse(text) as PixivAjaxResponse<T>
  } catch (error) {
    return null
  }
}

/** Artwork metadata (title, pageCount, cover urls). */
export async function fetchIllust(illustId: string): Promise<PixivIllust | null> {
  const response = await requestJson<PixivIllust>(`/ajax/illust/${illustId}`)
  return response?.body ?? null
}

/**
 * Per-page image urls. Returns null for ugoira (illustType 2), where the
 * endpoint legitimately responds with an empty array.
 */
export async function fetchIllustPages(illustId: string): Promise<PixivPage[] | null> {
  const response = await requestJson<PixivPage[]>(`/ajax/illust/${illustId}/pages?lang=en`)
  if (!response?.body || !response.body.length) {
    return null
  }
  return response.body
}

/**
 * Fallback source: every artwork page embeds its own metadata in
 * `<meta id="meta-preload-data">`. Used when the AJAX endpoints fail.
 */
export function readPreloadedIllust(illustId: string): PixivIllust | null {
  try {
    const meta = document.querySelector('meta#meta-preload-data')
    const raw = meta?.getAttribute('content')
    if (!raw) {
      return null
    }
    const data = JSON.parse(raw) as PixivPreloadData
    return data.illust?.[`illust:${illustId}`] ?? null
  } catch (error) {
    return null
  }
}

function normalize(
  urls?: PixivImageUrls,
  width?: number,
  height?: number
): PixivPageImages {
  const original = urls?.original ?? ''
  const regular = urls?.regular ?? original
  const thumb = urls?.small ?? urls?.thumb_mini ?? regular ?? original

  return {
    original,
    regular,
    thumb,
    width: Number(width) || 0,
    height: Number(height) || 0
  }
}

/**
 * Build the page list.
 *
 * Multi-page works come from `/pages`. Single-page works and ugoira fall back
 * to the artwork's own `urls`, repeated `pageCount` times.
 */
export function toPageImages(
  pages: PixivPage[] | null,
  illust: PixivIllust | null
): PixivPageImages[] {
  if (pages && pages.length) {
    return pages.map(page => normalize(page.urls, page.width, page.height))
  }

  if (illust?.urls) {
    const count = Number(illust.pageCount) || 1
    const list: PixivPageImages[] = []
    for (let i = 0; i < count; i++) {
      list.push(normalize(illust.urls, illust.width, illust.height))
    }
    return list
  }

  return []
}

export function resolveTitle(illust: PixivIllust | null, fallback: string): string {
  const title = illust?.illustTitle ?? illust?.title ?? ''
  return title.trim() || fallback
}
