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
import { disableDocumentScroll, enableDocumentScroll } from './mobileRootScroll'
import { isChallengeFrame, isCloudflareChallengeDocument } from './platform/cloudflare'
import { challengeState } from '../core/store/challenge'
import { hasNhentaiPageStructure } from './platform/nh/structure'
import { LocalFolderAlbumService, pickFolder } from './local/folderService'
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
/** 「打开本地文件夹」选中的那个 service，Platform.LOCAL 时用它替代网络实现 */
let pendingLocalService: LocalFolderAlbumService | null = null
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
/** 验证窗口的 window.name，和 challenge store 里保持一致 */
const VERIFY_WINDOW_NAME = 'ehunter-cf-verify'
/** 验证窗口写、父窗口读的 localStorage 键 */
const VERIFY_READY_KEY = 'ehunter:verify-ready'
const EHUNTER_OPEN_DURATION_MS = 720
const EHUNTER_CLOSE_DURATION_MS = 580
const EHUNTER_OPEN_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'
const EHUNTER_CLOSE_EASING = 'cubic-bezier(0.55, 0.08, 0.68, 0.53)'

function readEHunterStatus(): boolean {
  // 存储层统一按结构化值返回后，这里不用再兼容 'true'/'false' 字符串
  const value = PlatformService.storageGet(EHUNTER_STATUS_KEY, true)
  return typeof value === 'boolean' ? value : true
}

function writeEHunterStatus(open: boolean): void {
  PlatformService.storageSet(EHUNTER_STATUS_KEY, open)
}

function createEhunterSwitch(onOpen: () => void): void {
  const existing = document.getElementById(EHUNTER_SWITCH_ID)
  if (existing) {
    existing.remove()
  }

  /*
   * 这个"拉绳"会被宿主样式影响（Bootstrap 站点尤其明显：容器被压在下面、
   * 或者 span 的尺寸被全局规则改掉）。用 setProperty + important 钉死，
   * z-index 直接顶到最大值，保证任何站点都盖不住它。
   */
  const container = document.createElement('div')
  const pin = (prop: string, value: string): void => {
    container.style.setProperty(prop, value, 'important')
  }
  pin('display', 'flex')
  pin('flex-direction', 'column')
  pin('justify-content', 'center')
  pin('align-items', 'center')
  pin('position', 'fixed')
  pin('right', '100px')
  pin('top', '-150px')
  pin('z-index', '2147483647')
  pin('cursor', 'pointer')
  pin('visibility', 'visible')
  pin('opacity', '1')
  pin('pointer-events', 'auto')
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
  line.style.setProperty('display', 'block', 'important')
  line.style.setProperty('width', '2px', 'important')
  line.style.setProperty('height', '200px', 'important')
  line.style.setProperty('background', '#2ecc71', 'important')
  line.style.setProperty('box-shadow', '0 1px 6px rgba(0,0,0,.117647), 0 1px 4px rgba(0,0,0,.117647)', 'important')
  container.appendChild(line)

  const ring = document.createElement('span')
  ring.style.setProperty('display', 'block', 'important')
  ring.style.setProperty('border', '2px solid #2ecc71', 'important')
  ring.style.setProperty('border-radius', '50%', 'important')
  ring.style.setProperty('width', '15px', 'important')
  ring.style.setProperty('height', '15px', 'important')
  ring.style.setProperty('box-shadow', '0 1px 6px rgba(0,0,0,.117647), 0 1px 4px rgba(0,0,0,.117647)', 'important')
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
            if (!hostActionsApplied && platform !== Platform.LOCAL) {
              applyPlatformHostActions(platform)
              hostActionsApplied = true
            }

            const albumService = platform === Platform.LOCAL && pendingLocalService
              ? pendingLocalService
              : createPlatformService(platform)
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
            const initError = err as InitializationError
            // 正在走验证流程时不甩红色错误面板，弹层里的提示已经说明情况
            if (!challengeState.active) {
              error.value = initError
            }
            console.error('eHunter initialization failed:', {
              message: initError.message,
              stack: initError.stack,
              platform: initError.platform,
              url: initError.url,
              timestamp: initError.timestamp
            })
          }
        }

        init()

        const handleClose = () => {
          writeEHunterStatus(false)
          restoreEHViewportOnClose()
          document.body.style.overflow = ''
          disableDocumentScroll()
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
  // 阅读器打开时不显示那个"拉绳"：它只用来在关闭状态下把插件叫出来。
  // 之前一直挂着，打开后会叠在页面上。
  const switchEl = document.getElementById(EHUNTER_SWITCH_ID)
  if (switchEl) {
    switchEl.style.setProperty('display', show ? 'none' : 'flex', 'important')
  }
  clearHideTimer()
  container.style.transitionProperty = 'top'
  container.style.transitionDuration = show
    ? `${EHUNTER_OPEN_DURATION_MS}ms`
    : `${EHUNTER_CLOSE_DURATION_MS}ms`
  container.style.transitionTimingFunction = show
    ? EHUNTER_OPEN_EASING
    : EHUNTER_CLOSE_EASING
  if (show) {
    // 触屏设备走文档滚动：阅读器回到文档流，根滚动器接管滚动，
    // 地址栏才会跟着收起。桌面保持原来的 fixed 全屏层。
    if (!enableDocumentScroll()) {
        // 只锁 body 不够：宿主页面的滚动容器可能在 html 上，
        // 右侧那条滚动条会留着、还能拖，但拖动对插件没有任何作用。
        document.documentElement.style.overflow = 'hidden'
        document.body.style.overflow = 'hidden'
    }
  } else {
    document.documentElement.style.overflow = ''
    document.body.style.overflow = ''
    disableDocumentScroll()
  }

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
  // 本地文件夹的图片是 blob 地址，切走后必须释放，否则选过大文件夹会一直占内存
  if (pendingLocalService) {
    pendingLocalService.dispose()
    pendingLocalService = null
  }
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
  disableDocumentScroll()
  restoreEHViewportOnClose()

  const container = document.getElementById(EHUNTER_CONTAINER_ID)
  if (container) {
    container.style.top = '-100%'
    container.style.visibility = 'hidden'
    container.style.pointerEvents = 'none'
  }
}

/**
 * 把本地文件夹当漫画看。
 *
 * 浏览器不允许脚本直接按路径读盘，必须由用户用文件选择器选一个目录，
 * 之后浏览器把里面的 File 对象交给脚本。选中后用文件里的图片构造一个
 * LocalFolderAlbumService，走和线上作品完全一样的阅读链路（含超分）。
 */
async function openLocalFolder(): Promise<void> {
  const picked = await pickFolder()
  if (!picked) {
    return
  }

  const service = new LocalFolderAlbumService(picked.files, picked.folderName)
  if (service.getPageCount() === 0) {
    console.warn('eHunter: 选中的文件夹里没有图片')
    return
  }

  // 当前可能正挂载着别的平台，先彻底卸掉再换成本地作品
  stopEHunter()
  if (pendingLocalService) {
    pendingLocalService.dispose()
  }
  pendingLocalService = service

  ensureMounted(Platform.LOCAL)
  openEHunter()
}

/** 注册脚本管理器菜单项（Tampermonkey 右键图标可见） */
function registerLocalFolderMenu(): void {
  const register = (globalThis as any).GM_registerMenuCommand
  if (typeof register !== 'function') {
    return
  }
  register('📁 打开本地文件夹', () => {
    void openLocalFolder()
  })
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

/**
 * 是否是「验证窗口」（由本脚本 window.open 打开，加载站点首页）。
 *
 * 只认 window.name。window.opener 在 Edge 上可能因为 noopener 策略是 null，
 * 拿它做条件会让验证窗口里的脚本什么都不做，父窗口永远等不到完成信号。
 */
function isVerifyPopup(): boolean {
  return window.name === VERIFY_WINDOW_NAME
}

/**
 * 验证窗口里：确认页面已经正常，就通知父窗口。
 *
 * 挑战页结构还在就不通知——那说明用户还没验证完，等页面跳转后脚本重跑。
 */
function announceVerifyReadyIfPossible(): void {
  const announce = () => {
    if (isCloudflareChallengeDocument()) {
      return
    }
    try {
      window.localStorage.setItem(VERIFY_READY_KEY, String(Date.now()))
    } catch {
      // localStorage 不可用就算了，父窗口会退回自己的判断
    }
  }
  if (document.readyState === 'complete') {
    announce()
  } else {
    window.addEventListener('load', announce, { once: true })
  }
}

/** 创建容器、挂 UI 桥、按上次状态决定是否自动打开 */
function mountPlatform(platform: Platform): void {
  ensureMounted(platform)
  ;(window as WindowWithEHunterBridge).__EHUNTER_UI__ = {
    open: openEHunter,
    close: closeEHunter,
    toggle: toggleEHunterView
  }
  createEhunterSwitch(openEHunter)
  if (readEHunterStatus()) {
    openEHunter()
  }
}

/**
 * 等 nhentai 的站点结构出现再挂载。
 *
 * 挑战页上这个结构永远不会出现——那是用户完成后整页跳转的事，
 * 所以超时以后安静退出即可，不要报错：用户此刻正看着验证页。
 */
function waitForNhentaiStructure(platform: Platform): void {
  const startedAt = Date.now()
  const timer = window.setInterval(() => {
    if (hasNhentaiPageStructure()) {
      window.clearInterval(timer)
      console.log('eHunter: nhentai page structure ready, mounting')
      mountPlatform(platform)
      return
    }
    if (Date.now() - startedAt > 20000) {
      window.clearInterval(timer)
      console.log('eHunter: gave up waiting for nhentai structure (likely a challenge page)')
    }
  }, 500)
}

// ---- Initial boot ----
if (isVerifyPopup()) {
  /**
   * 这是「验证窗口」——由 window.open 打开、用来完成 Cloudflare 验证的独立小窗口。
   *
   * 它加载的是站点首页。如果首页已经能正常渲染（没有挑战页结构），说明
   * cf_clearance 生效了，往 localStorage 写个记号，父窗口的 storage 事件会收到。
   *
   * 用 localStorage 而不是 window.opener.postMessage：Edge 上 window.open
   * 常常返回 null（即使窗口确实开着），父窗口根本拿不到引用去读状态；
   * 而两个窗口同源，storage 事件一定能送达。
   */
  announceVerifyReadyIfPossible()
} else if (isChallengeFrame()) {
  /**
   * 这个 iframe 是验证覆盖层里用来给用户完成 Cloudflare 验证的。
   * 它加载的仍是站点的 URL，@match 同样会命中，如果不在这里退出，
   * iframe 里会再跑一遍插件、再弹一次覆盖层，就是无限套娃。
   */
  console.log('eHunter: inside challenge frame, skipping initialization')
} else if (isCloudflareChallengeDocument()) {
  /**
   * 整个页面就是 Cloudflare 的验证页（打开 nh 时最常见）。
   * 这种情况下页面上本来就有"请验证您是真人"，用户直接点就行；
   * 插件再弹一层、里面再套一个同样的页面才是多余的。
   * 所以这里完全不挂载，把页面原样交给用户，验证通过后 Cloudflare
   * 会整页跳转到真实内容，脚本重新执行时自然就正常了。
   */
  console.log('eHunter: cloudflare challenge page, leaving it to the user')
} else {
  // 菜单入口：选本地文件夹当漫画看，不依赖当前站点
  registerLocalFolderMenu()

  const initialDetection = detectPlatform()
  if (initialDetection.platform) {
    if (initialDetection.platform === Platform.NH && !hasNhentaiPageStructure()) {
      /**
       * 首次打开 nhentai 时可能先落到 Cloudflare 挑战页：框架在、站点结构不在。
       * 这时候挂载只会撞解析器的 null 错误。先等着，结构一出现就挂载；
       * 如果是挑战页，用户完成后 Cloudflare 整页跳转，脚本会重新执行。
       */
      console.log('eHunter: nhentai page structure not ready, waiting')
      waitForNhentaiStructure(initialDetection.platform)
    } else {
      mountPlatform(initialDetection.platform)
    }
  } else {
    console.log('eHunter: No platform detected (non-album page), skipping initialization')
  }

  // Watch for SPA navigations in all cases so entering/leaving an album page (re)initializes.
  installSpaNavigationWatcher()
}
