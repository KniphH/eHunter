/**
 * 轻量 Markdown 渲染器。
 *
 * 只在两处使用：欢迎说明（core/assets/instructions.ts）与更新公告（update.json）。
 * 实际用到的语法只有：### 标题、有序/无序列表、行内代码、链接、图片、加粗、分段。
 * 为了这几种语法把 markdown-it（连带 entities 表、linkify、mdurl、几十条 rule）整个
 * 打进 500KB 的单文件不划算，所以这里只实现项目真正需要的子集。
 *
 * 与原实现的差异（已用 instructions + update.json 三语言全文逐条对比）：
 *  - 不支持表格、引用块、代码围栏、脚注、HTML 实体——这些文案里没有
 *  - 链接同样强制 target="_blank"
 *  - 反斜杠转义按字面量处理，不被误判成标记
 */
function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

const ESCAPE_BASE = 0xE000

/** 反斜杠转义先占位，避免 \` \* \[ 之类被后面的 inline 规则误判 */
function protectEscapes(text) {
    const saved = []
    const out = String(text).replace(/\\([\\`*_[\]()#+\-.!>])/g, (_, ch) => {
        const token = String.fromCharCode(ESCAPE_BASE + saved.length)
        saved.push(ch)
        return token
    })
    return { text: out, saved }
}

function restoreEscapes(text, saved) {
    return text.replace(/[\uE000-\uF8FF]/g, (ch) => {
        const index = ch.charCodeAt(0) - ESCAPE_BASE
        return index >= 0 && index < saved.length ? saved[index] : ch
    })
}

/** markdown-it 会把 URL 里的 { } 百分号编码，保持同样的行为 */
function encodeUrl(url) {
    return url.replace(/[{}]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)
}

function renderInline(raw) {
    const { text, saved } = protectEscapes(String(raw || ''))
    let out = escapeHtml(text)

    // 行内代码先处理，避免里面的 ** 或 [ 被当成标记
    out = out.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`)
    // 图片必须在链接前面，否则 ![alt](url) 会被链接规则吃掉一半
    out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) =>
        `<img src="${encodeUrl(url)}" alt="${alt}">`)
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) =>
        `<a href="${encodeUrl(url)}" target="_blank">${label}</a>`)
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

    return restoreEscapes(out, saved)
}

class MdRenderer {
    render(text) {
        const out = []
        let listTag = null
        /** 连续普通行走 markdown 的软换行语义：合并在同一个 <p> 里 */
        let paragraph = []

        const closeList = () => {
            if (listTag) {
                out.push(`</${listTag}>`)
                listTag = null
            }
        }
        const closeParagraph = () => {
            if (paragraph.length > 0) {
                out.push(`<p>${paragraph.join('\n')}</p>`)
                paragraph = []
            }
        }

        for (const rawLine of String(text || '').split(/\r?\n/)) {
            const line = rawLine.trim()
            if (!line) {
                closeList()
                closeParagraph()
                continue
            }

            const heading = line.match(/^(#{1,6})\s+(.*)$/)
            if (heading) {
                closeList()
                closeParagraph()
                const level = heading[1].length
                out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`)
                continue
            }

            const ordered = line.match(/^\d+\.\s+(.*)$/)
            const bullet = line.match(/^[-*]\s+(.*)$/)
            if (ordered || bullet) {
                closeParagraph()
                const wanted = ordered ? 'ol' : 'ul'
                if (listTag !== wanted) {
                    closeList()
                    listTag = wanted
                    out.push(`<${wanted}>`)
                }
                out.push(`<li>${renderInline((ordered || bullet)[1])}</li>`)
                continue
            }

            closeList()
            paragraph.push(renderInline(line))
        }

        closeList()
        closeParagraph()
        return out.join('\n') + '\n'
    }
}

const instance = new MdRenderer()
export default instance
