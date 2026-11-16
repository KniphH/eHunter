import { computed, onBeforeUnmount, ref, type Ref } from 'vue'

function clamp(val: number, min: number, max: number) {
    return Math.max(min, Math.min(max, val))
}

interface UsePageMenuOptions {
    pageViewRef: Ref<HTMLElement | null>
    menuOwnerId: string
}

/**
 * 同一时刻只可能有一个页菜单开着。
 *
 * 原来每个 PageView 实例都在 document 上挂一份 click 捕获监听 + 一份
 * `ehunter:page-menu-open` 监听，几百页的漫画就是几百份：任意一次点击要跑
 * N 个 handler（每个第一行判断 menuOpen 后 return），打开菜单还要 dispatch
 * 一次让 N 个实例各自判断。改成模块级单例：全局一个 click 监听，只关心
 * 当前打开的那个菜单。
 */
interface ActivePageMenu {
    owner: string
    keepOpen: (event: MouseEvent) => boolean
    close: () => void
}

let activePageMenu: ActivePageMenu | null = null

function onGlobalDocumentClick(event: MouseEvent): void {
    const menu = activePageMenu
    if (!menu || menu.keepOpen(event)) {
        return
    }
    // 点在阅读器容器内：交给 PageView 自己的 onClickBg 处理。
    // 它第一句就是 `if (menuOpen) { closeMenu(); return }`，关得干净；
    // 这里抢先 close 会让 onClickBg 看到 menuOpen=false 又去 openMenuAt，反而重开。
    const app = document.getElementById('ehunter-app')
    if (app && event.target instanceof Node && app.contains(event.target)) {
        return
    }
    menu.close()
}

document.addEventListener('click', onGlobalDocumentClick, true)

export function usePageMenu(options: UsePageMenuOptions) {
    const { pageViewRef, menuOwnerId } = options

    const menuOpen = ref(false)
    const menuAnchorX = ref(12)
    const menuAnchorY = ref(12)

    const menuAnchorStyle = computed(() => ({
        left: `${menuAnchorX.value}px`,
        top: `${menuAnchorY.value}px`,
    }))

    function getPageRect() {
        return pageViewRef.value?.getBoundingClientRect() || null
    }

    function positionMenu(clientX: number, clientY: number) {
        const rect = getPageRect()
        if (!rect) {
            menuAnchorX.value = 12
            menuAnchorY.value = 12
            return
        }
        menuAnchorX.value = clamp(clientX - rect.left, 8, Math.max(8, rect.width - 8))
        menuAnchorY.value = clamp(clientY - rect.top, 8, Math.max(8, rect.height - 8))
    }

    function openMenuAt(clientX: number, clientY: number) {
        // 先把别的页开着的菜单关掉，再开自己的
        if (activePageMenu && activePageMenu.owner !== menuOwnerId) {
            activePageMenu.close()
        }
        positionMenu(clientX, clientY)
        menuOpen.value = true
        activePageMenu = {
            owner: menuOwnerId,
            keepOpen: (event) => {
                const root = pageViewRef.value
                const target = event.target as Node | null
                if (!root || !target) {
                    return false
                }
                const menuAnchor = root.querySelector('.menu-anchor')
                return !!menuAnchor && menuAnchor.contains(target)
            },
            close: closeMenu,
        }
    }

    function closeMenu() {
        menuOpen.value = false
        if (activePageMenu?.owner === menuOwnerId) {
            activePageMenu = null
        }
    }

    onBeforeUnmount(() => {
        // 组件被卸载时如果它的菜单还挂着，别把单例指向一个已销毁的实例
        if (activePageMenu?.owner === menuOwnerId) {
            activePageMenu = null
        }
    })

    return {
        menuOpen,
        menuAnchorStyle,
        openMenuAt,
        closeMenu,
    }
}
