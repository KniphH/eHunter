// a parser for album's img page
export class ImgHtmlParser {
    private htmlText: string;
    private html: HTMLElement;
    
    constructor(html) {
        this.htmlText = html.replace(/src=/g, 'x-src='); // avoid load assets
        this.html = document.createElement('html');
        this.html.innerHTML = this.htmlText;
        return this;
    }

    /*
     * 这几个用安全访问而不是 `!`：页面结构不完整时（比如落在 Cloudflare 挑战页上），
     * 断言会抛 `Cannot read properties of null`，用户只看到一句莫名其妙的报错。
     * 返回 0 / 空串，交给 init 判断并给出能看懂的提示。
     */
    getCurPageNum(): number {
        const el = this.html.querySelector('.current');
        return el ? Number(el.textContent) : 0;
    }

    getPageCount(): number {
        const el = this.html.querySelector('.num-pages');
        return el ? Number(el.textContent) : 0;
    }

    getImgHeight(): number {
        return Number(this.html.querySelector('#image-container')!.children[0]!.children[0]!.getAttribute('height'));
    }

    getImgWidth(): number {
        return Number(this.html.querySelector('#image-container')!.children[0]!.children[0]!.getAttribute('width'));
    }

    getIntroUrl(): string {
        const el = this.html.querySelector('.go-back');
        return el ? (el.getAttribute('href') || '') : '';
    }

    getAlbumId(): string {
        return this.getIntroUrl().replace(/(\/|g)/g, '');
    }

    getImgUrl(): string {
        return this.html.querySelector('#image-container')!.children[0]!.children[0]!.getAttribute('x-src')!;
    }
}
