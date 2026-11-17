/**
 * nhentai 页面结构是否已经可以用来解析。
 *
 * 首次打开作品时，Cloudflare 有时会先返回一个挑战页：页面框架在，但里面没有
 * `.num-pages` / `#image-container` 这些站点结构。这时挂载插件，解析器会直接
 * 撞 `Cannot read properties of null`，用户看到「初始化失败」，刷新一次
 * （此时 cookie 已通过）才正常。
 *
 * 所以挂载前先确认结构；没有就等——挑战页是用户完成后整页跳转，跳转后脚本
 * 重新执行，自然就绪。
 */
export function hasNhentaiPageStructure(): boolean {
    return Boolean(
        document.querySelector('.num-pages')
        || document.querySelector('#image-container')
        || document.querySelector('.go-back'),
    )
}
