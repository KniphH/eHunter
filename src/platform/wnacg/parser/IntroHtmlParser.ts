import { normalizeImgUrl } from './ImgListParser'

export interface WnacgIntroThumb {
    pageUrl: string
    thumbSrc: string
}

// a parser for wnacg's album intro page (/photos-index-aid-{aid}.html and /photos-index-page-{n}-aid-{aid}.html)
export class IntroHtmlParser {
    private doc: Document

    constructor(html: string) {
        // DOMParser neither runs scripts nor loads images
        this.doc = new DOMParser().parseFromString(html, 'text/html')
    }

    getTitle(): string {
        // desktop layout uses #bodywrap h2, mobile layout uses #comicName
        const titleEl = this.doc.querySelector('#bodywrap h2') || this.doc.querySelector('#comicName')
        return (titleEl?.textContent || '').trim()
    }

    // the mobile layout (served by user agent) has no thumbnail grid, so this may be empty
    getThumbs(): Array<WnacgIntroThumb> {
        return Array.from(this.doc.querySelectorAll('.gallary_item .pic_box')).map(box => {
            const link = box.querySelector('a')
            const img = box.querySelector('img')
            const thumbSrc = img?.getAttribute('data-original') || img?.getAttribute('data-src') || img?.getAttribute('src') || ''
            return {
                pageUrl: link?.getAttribute('href') || '',
                thumbSrc: thumbSrc ? normalizeImgUrl(thumbSrc) : ''
            }
        })
    }
}
