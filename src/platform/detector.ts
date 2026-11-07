/**
 * Platform Detector
 * 
 * Detects the current platform based on browser URL (host + pathname).
 * Returns null if no platform is detected (non-album pages).
 */

import { Platform, type PlatformDetectionResult } from './types'
import { isTestEnvironmentHost } from '../../core/utils/runtimeEnv'

/**
 * Detect platform based on current browser URL
 * 
 * @returns PlatformDetectionResult with detected platform or null
 * 
 * URL Patterns:
 * - EH: e-hentai.org/s/* or exhentai.org/s/* (reader page)
 * - NH: nhentai.net/g/[id]/[page]/ (reader page)
 * - PX: www.pixiv.net/artworks/[id] (artwork page, also /en/artworks/[id])
 * - WNACG: wnacg.com/photos-slide-aid-[id].html (reader page)
 * - Test: localhost or IP addresses (127.0.0.1, 192.168.x.x, etc.)
 */
export function detectPlatform(): PlatformDetectionResult {
  const host = window.location.host
  const hostname = window.location.hostname
  const pathname = window.location.pathname

  const isEhHost = hostname === 'e-hentai.org' || hostname === 'exhentai.org'
  const isEhReaderPage = /^\/s\/[^/]+\/\d+-\d+\/?$/.test(pathname)

  // EH platform: reader page only
  if (isEhHost && isEhReaderPage) {
    return {
      platform: Platform.EH,
      host,
      pathname,
      isAlbumPage: true
    }
  }

  const isNhReaderPage = /^\/g\/\d+\/\d+\/$/.test(pathname)

  // NH platform: reader page only
  if (hostname === 'nhentai.net' && isNhReaderPage) {
    return {
      platform: Platform.NH,
      host,
      pathname,
      isAlbumPage: true
    }
  }

  const isPixivHost = hostname === 'www.pixiv.net' || hostname === 'pixiv.net'
  const isPixivArtworkPage = /^\/(?:en\/)?artworks\/\d+/.test(pathname)

  // Pixiv platform: artwork page only
  if (isPixivHost && isPixivArtworkPage) {
    return {
      platform: Platform.PX,
      host,
      pathname,
      isAlbumPage: true
    }
  }

  const isWnacgHost = hostname === 'wnacg.com' || hostname.endsWith('.wnacg.com')
  const isWnacgReaderPage = /^\/photos-slide-aid-\d+(?:-[a-z]+-\d+)*\.html$/.test(pathname)

  // WNACG platform: reader page only
  if (isWnacgHost && isWnacgReaderPage) {
    return {
      platform: Platform.WNACG,
      host,
      pathname,
      isAlbumPage: true
    }
  }

  // Test platform: localhost or IP addresses
  if (isTestEnvironmentHost(host)) {
    return {
      platform: Platform.TEST,
      host,
      pathname,
      isAlbumPage: true
    }
  }

  // No platform detected (non-album page or unsupported domain)
  return {
    platform: null,
    host,
    pathname,
    isAlbumPage: false
  }
}
