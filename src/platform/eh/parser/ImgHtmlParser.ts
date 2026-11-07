// a parser for album's img page
export class ImgHtmlParser {
    private htmlText: string;
    private html: HTMLElement;
    private document: Document | null;
    private i2: HTMLElement | undefined;
    private imgSizeInfo: Array<string> | undefined;

constructor(html) {
        this.htmlText = html.replace(/src=/g, 'x-src='); // avoid load assets
        this.html = document.createElement('html');
        this.html.innerHTML = this.htmlText;
        this.document = this.html.ownerDocument;
        this._initI2Element();
        this._initImgSizeInfo();
        return this;
    }

    private _initI2Element() {
        this.i2 = <HTMLElement>this.html.querySelector('#i2');
        if (!this.i2) {
            throw new Error('ImgHtmlParser: i2 is undefined');
        }
    }

    private _initImgSizeInfo() {
        this.imgSizeInfo = this.i2!.children[1]!.textContent!.split('::')[1].split('x');
    }

    getTitle(): string {
        let elem = this.html.querySelector('h1');
        return elem ? (elem.textContent || '') : '';
    }

    getCurPageNum(): number {
        return Number(this.i2!.getElementsByTagName('span')[0]!.textContent!);
    }

    getPageCount(): number {
        return Number(this.i2!.getElementsByTagName('span')[1]!.textContent);
    }

    getImgHeight(): number {
        return Number(this.imgSizeInfo![1].trim());
    }

    getImgWidth(): number {
        return Number(this.imgSizeInfo![0].trim());
    }

    getPreciseHeightOfWidth(): number {
        return Number(this.getImgHeight() / this.getImgWidth());
    }

    getIntroUrl(): string {
        let url = this.html!.querySelectorAll('.sb')![0].children![0].getAttribute('href')!
            .replace(/^.*?org/g, '').replace(/\?p=.*?$/g, '');
        return url;
    }

    getAlbumId(): string {
        return this.getIntroUrl().match(/g\/\d+(?=\/)/)![0].replace('g/', '');
    }

    getImgId(): string {
        return window.location.pathname.split('/')[2];
    }

    getNextImgId(): string {
        return this.document!.getElementById('i3')!.children![0].getAttribute('href')!.split('/')[4];
    }

    /**
     * 主图地址。
     *
     * 原来是 `htmlText.match('id="img" x-src="(.*?)"')` 然后取 `RegExp.$1`，两个坑：
     * 1. 属性顺序/空白一变就匹配不上（e-hentai 的标签偶发带别的属性）；
     * 2. **匹配失败时 `RegExp.$1` 不会清空**，返回的是上一次匹配的残留地址——
     *    表现就是"偶尔显示上一页/别的页的图"，而且刷新一次又好了。
     * 改成 DOM 查询，取不到就返回空串（让上层判失败去换源，绝不返回别人的地址）。
     */
    getImgUrl(): string {
        const node = this.html.querySelector('img#img') || this.html.querySelector('#img')
        if (!node) {
            return '';
        }
        return node.getAttribute('x-src') || node.getAttribute('src') || '';
    }

    /**
     * 原图地址。
     *
     * 上游按 `#i6` 页脚的 children 位置取「最后一个元素的第二个子元素的 href」，两个坑：
     * 1. 没有独立原图链接时 `#i6` 结构不同，`!` 断言会抛异常，或取到别的元素的 href；
     * 2. 页脚 DOM 一改就失效。
     * 改成按 `fullimg.php` 语义定位，与布局无关。取不到时返回空串，由上层明确报「没有原图」，
     * 不静默降级到页面图片——否则用户点了「原图」却不知道拿到的是普通图。
     */
    getOriginalImgUrl(): string {
        return this.html.querySelector('#i6 a[href*="fullimg.php"]')?.getAttribute('href') || ''
    }

    /** 同上：不能依赖 `RegExp.$1` 的残留值，匹配不到就返回空串 */
    getSourceId(): string {
        const node = this.html!.querySelector('#loadfail')
        const matched = (node?.getAttribute('onclick') || '').match(/nl\('(.*?)'\)/)
        return matched ? matched[1] : ''
    }
}
