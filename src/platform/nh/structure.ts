/**
 * nhentai 页面结构是否真的可以用来解析。
 *
 * 首次打开作品时，Cloudflare 有时先返回一个不完整的骨架：`.num-pages` 这类
 * 节点的壳在，但里面还没有页数（也可能根本没有站点结构）。
 * 之前只判断元素是否存在，于是「壳在、内容空」也会被当成就绪，挂载后解析
 * 拿到 0 页，直接报「Page structure not found」——用户只能刷新一次才正常。
 *
 * 所以这里必须校验**内容**：页数得是个正数，图片容器得真有子节点。
 */
export function hasNhentaiPageStructure(): boolean {
    const numPages = document.querySelector('.num-pages')
    if (numPages) {
        const count = Number((numPages.textContent || '').trim())
        if (Number.isFinite(count) && count > 0) {
            return true
        }
    }

    const container = document.querySelector('#image-container')
    if (container && container.children.length > 0) {
        return true
    }

    return false
}
