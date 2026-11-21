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

  const isWnacgHost = /(^|\.)wnacg\.(com|ru|net|org)$/i.test(hostname)
  // 阅读页有两种：photos-slide-aid-*（滑动阅读）和 photos-view-id-*（整本视图）
  const isWnacgReaderPage = /^\/photos-(?:slide-aid|view-id)-\d+(?:-[a-z]+-\d+)*\.html$/.test(pathname)

  // WNACG platform: reader page only
  if (isWnacgHost && isWnacgReaderPage) {
    return {
      platform: Platform.WNACG,
      host,
      pathname,
      isAlbumPage: true
    }
  }

  // 禁漫天堂：阅读页是 /photo/{id}/，详情页 /album/{id}/（只在阅读页挂载）
  const isJmHost = /(^|\.)(18comic\.(vip|ink)|jmcomic-zzz\.(one|org)|comic18j-[a-z0-9]+\.(com|work|cc|net))$/i.test(hostname)
  const isJmReaderPage = /^\/photo\/\d+/i.test(pathname)

  if (isJmHost && isJmReaderPage) {
    return {
      platform: Platform.JM,
      host,
      pathname,
      isAlbumPage: true
    }
  }

  // JoyACG: 作品页是纯数字路径（/096528/）
  const isJoyAcgHost = hostname === 'joyacg.cc' || hostname.endsWith('.joyacg.cc')
    || hostname === 'joyacg.top' || hostname.endsWith('.joyacg.top')
  const isJoyAcgAlbumPage = /^\/\d+\/?$/.test(pathname)

  if (isJoyAcgHost && isJoyAcgAlbumPage) {
    return {
      platform: Platform.JOYACG,
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
