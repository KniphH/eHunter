/**
 * Shadow DOM 挂载点。
 *
 * 单独成模块是为了避免 main.ts 与各个组件之间互相 import 造成循环依赖：
 * main.ts 建好 shadow 后把节点登记进来，组件用 getMountPoint() 作为 teleport 目标。
 * teleport 必须传**元素**而不是选择器——选择器走 document.querySelector，
 * 穿透不了 shadow 边界。
 */
let mountPoint: HTMLElement | null = null

export function setMountPoint(element: HTMLElement | null): void {
    mountPoint = element
}

export function getMountPoint(): HTMLElement | null {
    return mountPoint
}
