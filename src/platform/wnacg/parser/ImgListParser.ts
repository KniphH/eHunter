// a parser for wnacg's image list script (/photos-item-aid-{aid}.html)
// the script looks like: mReader.initData({"page_url":[...],"page_size":[[w,h],...],...});

export interface WnacgImgListItem {
    url: string
    width: number
    height: number
}

export class ImgListParser {
    private items: Array<WnacgImgListItem> = []

    constructor(scriptText: string) {
        const data = parseInitData(scriptText)
        const urls: Array<unknown> = Array.isArray(data.page_url) ? data.page_url : []
        const sizes: Array<unknown> = Array.isArray(data.page_size) ? data.page_size : []
        this.items = urls
            .filter((url): url is string => typeof url === 'string' && url.trim() !== '')
            .map((url, index) => {
                const size = Array.isArray(sizes[index]) ? sizes[index] as Array<unknown> : []
                return {
                    url: normalizeImgUrl(url),
                    width: Number(size[0]) || 0,
                    height: Number(size[1]) || 0
                }
            })
        if (this.items.length === 0) {
            throw new Error('No image found in wnacg image list')
        }
    }

    getItems(): Array<WnacgImgListItem> {
        return this.items
    }
}

function parseInitData(scriptText: string): any {
    // the data object is wrapped in `$(document).ready(function(){ ... })`, so match its own closing brace
    // the site also emits trailing commas (e.g. `"...jpg",]`), which JSON.parse rejects
    const jsonText = extractObjectLiteral(scriptText, scriptText.indexOf('initData')).replace(/,\s*([\]}])/g, '$1')
    try {
        return JSON.parse(jsonText)
    } catch (e) {
        return { page_url: extractStringArray(jsonText, 'page_url'), page_size: [] }
    }
}

// returns the first `{...}` literal after `from`, ignoring braces inside strings
function extractObjectLiteral(text: string, from: number): string {
    const start = from < 0 ? -1 : text.indexOf('{', from)
    if (start < 0) {
        throw new Error('Image list data not found in wnacg page script')
    }
    let depth = 0
    let quote = ''
    for (let i = start; i < text.length; i++) {
        const ch = text[i]
        if (quote) {
            if (ch === '\\') {
                i++
            } else if (ch === quote) {
                quote = ''
            }
        } else if (ch === '"' || ch === '\'') {
            quote = ch
        } else if (ch === '{') {
            depth++
        } else if (ch === '}' && --depth === 0) {
            return text.slice(start, i + 1)
        }
    }
    throw new Error('Image list data is incomplete in wnacg page script')
}

function extractStringArray(text: string, key: string): Array<string> {
    const match = text.match(new RegExp(`"${key}"\\s*:\\s*\\[([\\s\\S]*?)\\]`))
    if (!match) {
        return []
    }
    return (match[1].match(/"(?:[^"\\]|\\.)*"/g) || []).map(item => JSON.parse(item))
}

// same as the site's reader: images are served over https even if listed as http or protocol-relative
export function normalizeImgUrl(url: string): string {
    return url.trim().replace(/^http:\/\//, 'https://').replace(/^\/\/+/, 'https://')
}
