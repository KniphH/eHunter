import type { AlbumService } from '../../core/service/AlbumService'
import type { ImgPageInfo, ThumbInfo, PreviewThumbnailStyle, ImgSrcMode } from '../../core/model/model'
import { ThumbMode } from '../../core/model/model'

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|bmp|avif)$/i

/** 占位比例：图片解码前先用它撑高度，加载完会被真实尺寸覆盖 */
const PLACEHOLDER_RATIO = 1.4

/**
 * 本地文件夹当漫画看。
 *
 * 油猴跑在网页沙箱里，没法拿路径直接读盘，只能由用户用文件选择器选一个文件夹，
 * 浏览器把里面的 File 对象交过来。这里把它包装成和其他平台一样的 AlbumService，
 * 于是阅读器、缩放、超分这些都不用改——超分那边 fetch 的是 blob URL，照样能用。
 */
export class LocalFolderAlbumService implements AlbumService {
    private infos: ImgPageInfo[] = []
    private thumbs: ThumbInfo[] = []
    private title: string
    private albumId: string

    constructor(files: File[], folderName: string) {
        this.title = folderName || '本地文件夹'
        this.albumId = `local:${folderName}`

        // 自然排序：1.jpg < 2.jpg < 10.jpg，而不是字典序的 1 < 10 < 2
        const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
        const images = files
            .filter(file => IMAGE_EXT_RE.test(file.name))
            .sort((a, b) => collator.compare(a.name, b.name))

        this.infos = images.map((file, index) => ({
            id: `${index}:${file.name}`,
            index,
            pageUrl: '',
            src: URL.createObjectURL(file),
            thumbHeight: 0,
            thumbWidth: 0,
            thumbStyle: '',
            heightOfWidth: PLACEHOLDER_RATIO,
        }))

        this.thumbs = images.map((file, index) => ({
            id: `${index}:${file.name}`,
            mode: ThumbMode.IMG,
            src: this.infos[index].src,
            style: '',
            height: 0,
            width: 0,
        }))
    }

    isSupportOriginImg(): boolean {
        return false
    }

    isSupportImgChangeSource(): boolean {
        return false
    }

    isSupportThumbView(): boolean {
        return this.thumbs.length > 0
    }

    getTitle(): string {
        return this.title
    }

    getAlbumId(): string {
        return this.albumId
    }

    getIntroUrl(): string {
        return ''
    }

    getPageCount(): number {
        return this.infos.length
    }

    getCurPageIndex(): number {
        return 0
    }

    async init(): Promise<Error | void> {
        if (this.infos.length === 0) {
            return new Error('No image found in the selected folder')
        }
    }

    getThumbInfos(): Array<ThumbInfo> {
        return this.thumbs
    }

    getImgPageInfos(): Array<ImgPageInfo> {
        return this.infos
    }

    async getImgSrc(index: number): Promise<ImgPageInfo | Error> {
        const info = this.infos[index]
        if (!info) {
            return new Error(`Image page info not found for index ${index}`)
        }
        return { ...info }
    }

    getPreviewThumbnailStyle(): PreviewThumbnailStyle {
        return {
            'background-image': '',
            'background-position': '',
            'background-size': '',
        }
    }

    /** 本地文件没有"换源"这一步，留空实现以免调用方判断 undefined */
    invalidateImgSrc(): void {
        // no-op
    }

    /** 切到别的作品/关闭阅读器时释放 blob，否则选过大文件夹会一直占着内存 */
    dispose(): void {
        for (const info of this.infos) {
            if (info.src) {
                URL.revokeObjectURL(info.src)
            }
        }
        this.infos = []
        this.thumbs = []
    }
}

/**
 * 弹系统的文件夹选择框，返回里面所有文件。
 *
 * 用 `webkitdirectory` 而不是 showDirectoryPicker：后者在部分浏览器/油猴沙箱里
 * 拿不到，前者兼容性更广，代价是每次都要重新选（浏览器不允许记住路径）。
 */
export function pickFolder(): Promise<{ files: File[], folderName: string } | null> {
    return new Promise(resolve => {
        const input = document.createElement('input')
        input.type = 'file'
        // 非标准属性，但各主流浏览器都支持
        input.setAttribute('webkitdirectory', '')
        input.setAttribute('directory', '')
        input.multiple = true
        input.style.display = 'none'

        let settled = false
        const finish = (value: { files: File[], folderName: string } | null) => {
            if (settled) {
                return
            }
            settled = true
            input.remove()
            resolve(value)
        }

        input.addEventListener('change', () => {
            const files = Array.from(input.files || [])
            if (files.length === 0) {
                finish(null)
                return
            }
            // webkitRelativePath 形如 "漫画名/001.jpg"
            const first = files[0] as File & { webkitRelativePath?: string }
            const folderName = (first.webkitRelativePath || '').split('/')[0] || '本地文件夹'
            finish({ files, folderName })
        })

        // 用户直接关掉选择框时不会触发 change，靠焦点回来兜底
        window.addEventListener(
            'focus',
            () => {
                window.setTimeout(() => {
                    if (!settled && (!input.files || input.files.length === 0)) {
                        finish(null)
                    }
                }, 600)
            },
            { once: true },
        )

        document.body.appendChild(input)
        input.click()
    })
}
