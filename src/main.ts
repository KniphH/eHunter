import { createApp, ref, h } from 'vue'
import TestApp from '../core/TestApp.vue'
import LoadingView from '../core/components/LoadingView.vue'
import '../core/style/_normalize.scss'
import { NameAlbumService } from '../core/service/AlbumService'
import { init as initAlbumStore, store } from '../core/store/app'
import { detectPlatform } from './platform/detector'
import { createPlatformService } from './platform/factory'
import { initializeWithTimeout } from './platform/initializer'
import { applyPlatformHostActions } from './platform/hostActions'
import PlatformService from './platform/base/service/PlatformService.js'
import { Platform, type InitializationError } from './platform/types'

/// <reference types="vite-svg-loader" />

// Module-scope shared state. The reader's Vue app is mounted ONCE; on SPA navigation we only
// refresh the store (via initAlbumStore), never tear the app down — tearing it down would
// re-register global listeners and reset the store singleton.
let ehunterApp: ReturnType<typeof createApp> | null = null
let isMounted = false
let hostActionsApplied = false
let hideTimerId: number | null = null
let originalViewportContent: string | null = null
let hadViewportMeta = false
let viewportAdjusted = false
// Platform the currently mounted reader was built for.
let mountedPlatform: Platform | null = null
// Incremented every time an artwork load starts. Only the newest load may apply its result
// to the store — the initial fetch is async, so without this a slow first artwork could
// finish AFTER a newer one and overwrite the reader with the wrong (older) artwork.
let reloadGeneration = 0

type EHunterUiBridge = {
  open: () => void
  close: () => void
  toggle: (show: boolean) => void
}

type WindowWithEHunterBridge = Window & {
  __EHUNTER_UI__?: EHunterUiBridge
}

const EHUNTER_STATUS_KEY = 'ehunter:reader:open'
const EHUNTER_SWITCH_ID = 'ehunter-switch'
const EHUNTER_CONTAINER_ID = 'ehunter-app'
const EHUNTER_OPEN_DURATION_MS = 720
const EHUNTER_CLOSE_DURATION_MS = 580
const EHUNTER_OPEN_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'
const EHUNTER_CLOSE_EASING = 'cubic-bezier(0.55, 0.08, 0.68, 0.53)'

function readEHunterStatus(): boolean {
  const value = PlatformService.storageGet(EHUNTER_STATUS_KEY, true)
  if (typeof value === 'boolean') {
    return value
  }
  if (value === 'true') {
    return true
  }
  if (value === 'false') {
    return false
  }
  return true
}

function writeEHunterStatus(open: boolean): void {
  PlatformService.storageSet(EHUNTER_STATUS_KEY, open)
}

function createEhunterSwitch(onOpen: () => void): void {
  const existing = document.getElementById(EHUNTER_SWITCH_ID)
  if (existing) {
    existing.remove()
  }

  const container = document.createElement('div')
  container.style.display = 'flex'
  container.style.flexDirection = 'column'
  container.style.justifyContent = 'center'
  container.style.alignItems = 'center'
  container.style.position = 'fixed'
  container.style.right = '100px'
  container.style.top = '-150px'
  container.style.zIndex = '2147483646'
  container.style.cursor = 'pointer'
  container.style.transition = 'all 0.2s cubic-bezier(.46,-0.23,.37,2.38)'
  container.setAttribute('title', 'open eHunter')
  container.setAttribute('id', EHUNTER_SWITCH_ID)
  container.addEventListener('click', () => {
    container.style.top = '-50px'
    window.setTimeout(() => {
      container.style.top = '-150px'
    }, 2000)
    onOpen()
  })

  const line = document.createElement('span')
  line.style.width = '2px'
  line.style.height = '200px'
  line.style.background = '#2ecc71'
  line.style.boxShadow = '0 1px 6px rgba(0,0,0,.117647), 0 1px 4px rgba(0,0,0,.117647)'
  container.appendChild(line)

  const ring = document.createElement('span')
  ring.style.border = '2px solid #2ecc71'
  ring.style.borderRadius = '50%'
  ring.style.width = '15px'
  ring.style.height = '15px'
  ring.style.boxShadow = '0 1px 6px rgba(0,0,0,.117647), 0 1px 4px rgba(0,0,0,.117647)'
  container.appendChild(ring)

  document.body.appendChild(container)
}

const isMobileLike = (): boolean => {
  return window.matchMedia('(pointer: coarse)').matches || /iphone|ipad|ipod|android|mobile/i.test(navigator.userAgent)
}

const ensureEHViewportForOpen = (): void => {
  if (mountedPlatform !== Platform.EH || !isMobileLike()) {
    return
  }

  let viewportMeta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null
  const desiredContent = 'width=device-width, initial-scale=1, viewport-fit=cover'

  if (!viewportAdjusted) {
    hadViewportMeta = Boolean(viewportMeta)
    originalViewportContent = viewportMeta
      ? viewportMeta.getAttribute('content')
      : null
    viewportAdjusted = true
  }

  if (!viewportMeta) {
    viewportMeta = document.createElement('meta')
    viewportMeta.name = 'viewport'
    viewportMeta.setAttribute('data-ehunter-managed', '1')
    ;(document.head || document.documentElement).appendChild(viewportMeta)
  }

  viewportMeta.setAttribute('content', desiredContent)
}

const restoreEHViewportOnClose = (): void => {
  if (!viewportAdjusted) {
    return
  }

  const viewportMeta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null
  if (!hadViewportMeta) {
    if (viewportMeta?.getAttribute('data-ehunter-managed') === '1') {
      viewportMeta.remove()
    }
  } else if (viewportMeta) {
    if (originalViewportContent === null) {
      viewportMeta.removeAttribute('content')
    } else {
      viewportMeta.setAttribute('content', originalViewportContent)
    }
  }

  originalViewportContent = null
  hadViewportMeta = false
  viewportAdjusted = false
}

const clearHideTimer = (): void => {
  if (hideTimerId !== null) {
    window.clearTimeout(hideTimerId)
    hideTimerId = null
  }
}

const scheduleHideContainer = (container: HTMLElement, delayMs: number): void => {
  clearHideTimer()
  hideTimerId = window.setTimeout(() => {
    container.style.visibility = 'hidden'
    container.style.pointerEvents = 'none'
    hideTimerId = null
  }, delayMs)
}

const ensureMounted = (platform: Platform): HTMLElement => {
  let container = document.getElementById(EHUNTER_CONTAINER_ID)
  if (!container) {
    container = document.createElement('div')
    container.id = EHUNTER_CONTAINER_ID
    container.classList.add('normalize')
    container.style.position = 'fixed'
    container.style.height = '100%'
    container.style.width = '100%'
    container.style.transitionProperty = 'top'
    container.style.transitionDuration = `${EHUNTER_OPEN_DURATION_MS}ms`
    container.style.transitionTimingFunction = EHUNTER_OPEN_EASING
    container.style.background = '#333333'
    container.style.zIndex = '2147483647'
    container.style.top = '-100%'
    container.style.left = '0'
    container.style.visibility = 'hidden'
    container.style.pointerEvents = 'none'
    document.body.appendChild(container)
  }

  if (!isMounted) {
    const app = createApp({
      setup() {
        const isLoading = ref(true)
        const error = ref<InitializationError | null>(null)

        const init = async () => {
          const gen = ++reloadGeneration
          try {
            if (!hostActionsApplied) {
              applyPlatformHostActions(platform)
              hostActionsApplied = true
            }

            const albumService = createPlatformService(platform)
            app.provide(NameAlbumService, albumService)
            await initializeWithTimeout(albumService, platform)
            // Apply only when no newer load has started: the initial fetch is async, so if
            // the user navigated to another artwork meanwhile, a late result here would
            // overwrite the newer artwork with the older one.
            if (gen === reloadGeneration) {
              // Push data into the store. On first load this fixes the Pixiv fetch race
              // (App.vue's onMounted may run before the async fetch resolves); on SPA
              // re-initialization this is the only path that refreshes the store.
              initAlbumStore(albumService)
            }
            isLoading.value = false
          } catch (err) {
            isLoading.value = false
            error.value = err as InitializationError
            console.error('eHunter initialization failed:', {
              message: error.value.message,
              stack: error.value.stack,
              platform: error.value.platform,
              url: error.value.url,
              timestamp: error.value.timestamp
            })
          }
        }

        init()

        const handleClose = () => {
          writeEHunterStatus(false)
          restoreEHViewportOnClose()
          document.body.style.overflow = ''
          const root = document.getElementById(EHUNTER_CONTAINER_ID)
          if (root) {
            root.style.top = '-100%'
            scheduleHideContainer(root, EHUNTER_CLOSE_DURATION_MS)
          }
        }

        return {
          isLoading,
          error,
          handleClose
        }
      },
      render() {
        return h(LoadingView, {
          isLoading: this.isLoading,
          error: this.error,
          onClose: this.handleClose
        }, {
          default: () => h(TestApp)
        })
      }
    })

    app.mount(`#${EHUNTER_CONTAINER_ID}`)
    ehunterApp = app
    isMounted = true
    mountedPlatform = platform
  }

  return container
}

const toggleEHunterView = (show: boolean): void => {
  const container = ensureMounted(mountedPlatform!)
  clearHideTimer()
  container.style.transitionProperty = 'top'
  container.style.transitionDuration = show
    ? `${EHUNTER_OPEN_DURATION_MS}ms`
    : `${EHUNTER_CLOSE_DURATION_MS}ms`
  container.style.transitionTimingFunction = show
    ? EHUNTER_OPEN_EASING
    : EHUNTER_CLOSE_EASING
  document.body.style.overflow = show ? 'hidden' : ''

  if (show) {
    ensureEHViewportForOpen()
    container.style.visibility = 'visible'
    container.style.pointerEvents = 'auto'
    requestAnimationFrame(() => {
      container.style.top = '0'
    })
    return
  }

  restoreEHViewportOnClose()
  container.style.top = '-100%'
  scheduleHideContainer(container, EHUNTER_CLOSE_DURATION_MS)
}

const openEHunter = (): void => {
  writeEHunterStatus(true)
  toggleEHunterView(true)
}

const closeEHunter = (): void => {
  writeEHunterStatus(false)
  toggleEHunterView(false)
}

/**
 * Tear the reader down so it can be re-bootstrapped for another artwork.
 *
 * This is the key to SPA re-initialization: components such as PageView capture the album
 * service via `inject(NameAlbumService)` at setup time, so refreshing the store alone is
 * NOT enough — they would keep calling `getImgSrc()` on the PREVIOUS artwork's service and
 * keep loading the first artwork's images. Re-mounting gives them the new service.
 *
 * Re-mounting is safe because app.ts init() registers the global keyboard/resize listeners
 * and runs the one-time checks only on the FIRST call (guarded by `isInited`), while the
 * album data is refreshed on every call.
 */
function stopEHunter(): void {
  if (ehunterApp) {
    ehunterApp.unmount()
    ehunterApp = null
  }
  isMounted = false

  // Clear the previous artwork so nothing lingers while the new one is being fetched.
  store.pageCount = 0
  store.imgPageInfos = []
  store.thumbInfos = []
  store.curViewIndex = 0

  document.body.style.overflow = ''
  restoreEHViewportOnClose()

  const container = document.getElementById(EHUNTER_CONTAINER_ID)
  if (container) {
    container.style.top = '-100%'
    container.style.visibility = 'hidden'
    container.style.pointerEvents = 'none'
  }
}

// Pixiv is a Next.js SPA: clicking another artwork triggers history.pushState + a React
// re-render of <main> WITHOUT a full page reload, so the userscript never re-runs and the
// reader keeps showing the previous artwork. We watch the URL and re-initialize accordingly.
function installSpaNavigationWatcher(): void {
  let lastKey = location.pathname + location.search + location.hash

  const onUrlMaybeChanged = (): void => {
    const key = location.pathname + location.search + location.hash
    if (key === lastKey) {
      return
    }
    lastKey = key

    const detectionResult = detectPlatform()
    if (!detectionResult.platform) {
      console.log('eHunter: navigated away from album page, hiding reader')
      stopEHunter()
      const switchEl = document.getElementById(EHUNTER_SWITCH_ID)
      if (switchEl) {
        switchEl.remove()
      }
      return
    }

    console.log(`eHunter: URL changed -> ${location.href}, re-initializing reader`)
    // Re-mount the reader for the new artwork (see stopEHunter): this is what makes
    // PageView & friends pick up the new album service instead of the previous one.
    // The bootstrap inside ensureMounted() creates the service, provides it, fetches the
    // artwork and refreshes the store, and shows the loading view until it is ready.
    stopEHunter()
    ensureMounted(detectionResult.platform)
    createEhunterSwitch(openEHunter)
    if (readEHunterStatus()) {
      openEHunter()
    }
  }

  // Intercept client-side routing used by SPAs (Pixiv uses pushState/replaceState).
  const wrap = (type: 'pushState' | 'replaceState'): void => {
    const original = history[type]
    history[type] = function (this: History, ...args: any[]): void {
      const result = (original as (...a: any[]) => void).apply(this, args)
      onUrlMaybeChanged()
      return result
    } as typeof history[typeof type]
  }
  wrap('pushState')
  wrap('replaceState')
  window.addEventListener('popstate', onUrlMaybeChanged)
  window.addEventListener('hashchange', onUrlMaybeChanged)
  // Fallback poll: catches any navigation we don't intercept (framework-specific routing, etc.)
  window.setInterval(onUrlMaybeChanged, 400)
}

// ---- Initial boot ----
const initialDetection = detectPlatform()
if (initialDetection.platform) {
  ensureMounted(initialDetection.platform)
  ;(window as WindowWithEHunterBridge).__EHUNTER_UI__ = {
    open: openEHunter,
    close: closeEHunter,
    toggle: toggleEHunterView
  }
  createEhunterSwitch(openEHunter)
  if (readEHunterStatus()) {
    openEHunter()
  }
} else {
  console.log('eHunter: No platform detected (non-album page), skipping initialization')
}

// Watch for SPA navigations in all cases so entering/leaving an album page (re)initializes.
installSpaNavigationWatcher()
