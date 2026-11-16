type SupportedLang = 'cn' | 'en' | 'jp'
import pkgJson from '../../package.json'

/**
 * 首次安装时的欢迎说明。
 *
 * 原本这份文案是从上游 eHunter 直接搬来的，里面混着上游的教程截图、
 * eHunter-local 推广、上游作者的邮箱和应用商店好评请求。这个分支既不在商店上架，
 * 那些截图也已经和现在的界面不符，全部去掉，只留与本分支实际行为一致的操作指引。
 * 仓库地址走 config.homePage，不在文案里写死。
 */
const welcomeInstructionTemplate: Record<SupportedLang, string> = {
    cn: `
1.切换语言：在顶栏的语言下拉框里选择中文 / English / 日本語。

2.显示/隐藏顶栏：点击顶栏上的开关键；点关闭键则退出阅读器。

3.在页面右上角点击 eHunter 开关打开阅读器。

4.\`滚动\`模式下，支持\`A\`. \`D\`, \`Left(左)\`和\`Right(右)\`键翻页。

5.\`书页\`模式下，点击屏幕下方翻下一页，点击屏幕上方翻到上一页。支持\`A\`. \`D\`, \`Left(左)\`, \`Right(右)\`键翻页，也可以用鼠标滚轮翻页。

6.\`分卷页数\`对性能要求较高，请不要设置过高，可能会导致卡顿。

7.像素超分是可选的，在设置里导入 Anime4K 的 .glsl 算法文件后开启；算法文件保存在油猴存储里，所有站点共用。

### 反馈和建议
* 在[Github]({{HOME_PAGE}})上提 issue。

### 关于
* eHunter Enhanced v{{VERSION}}
* 基于 hanFengSan/eHunter（MIT），由 KniphH 维护的增强分支
* [项目地址]({{HOME_PAGE}})
`,
    en: `
1.Change language in the language dropdown on the top bar: Chinese / English / Japanese.

2.Use the top-bar switch to show/hide the bar; the close button exits the reader.

3.Click the eHunter switch at the upper right of the page to open the reader.

4.In \`Scroll\` mode, you can turn pages with \`A\`, \`D\`, \`Left\`, and \`Right\`.

5.In \`Book\` mode, click the lower part of the screen to go to the next page, and click the upper part to go to the previous page. You can also turn pages with \`A\`, \`D\`, \`Left\`, and \`Right\`, or use the mouse wheel.

6.\`Volume size\` has relatively high performance requirements. Avoid setting it too high, or the reader may lag.

7.Super-resolution is optional: import Anime4K .glsl files in settings, then enable it. Shader files are stored in the userscript manager and shared across all supported sites.

### Feedback & Suggestions
* Open an issue on [Github]({{HOME_PAGE}}).

### About
* eHunter Enhanced v{{VERSION}}
* Enhanced fork of hanFengSan/eHunter (MIT), maintained by KniphH
* [Project home]({{HOME_PAGE}})
`,
    jp: `
1.トップバーの言語ドロップダウンで 中国語 / English / 日本語 を切り替えられます。

2.トップバーのスイッチでバーを表示/非表示にし、閉じるボタンでリーダーを終了します。

3.ページ右上の eHunter スイッチをクリックするとリーダーが開きます。

4.\`スクロール\`モードでは、\`A\`、\`D\`、\`Left\`、\`Right\`キーでページをめくれます。

5.\`ブック\`モードでは、画面下部をクリックすると次のページ、画面上部をクリックすると前のページに移動します。\`A\`、\`D\`、\`Left\`、\`Right\`キー、またはマウスホイールでもページをめくれます。

6.\`分巻ページ数\`はパフォーマンス負荷が高いため、上げすぎると動作が重くなる場合があります。

7.超解像は任意機能です。設定で Anime4K の .glsl ファイルを読み込んで有効にしてください。アルゴリズムファイルはユーザースクリプトマネージャのストレージに保存され、全サイトで共有されます。

### フィードバックと提案
* [Github]({{HOME_PAGE}}) で issue を作成できます。

### について
* eHunter Enhanced v{{VERSION}}
* hanFengSan/eHunter（MIT）の拡張フォーク、KniphH が保守
* [プロジェクトのホームページ]({{HOME_PAGE}})
`,
}

const bookInstructionTemplate: Record<SupportedLang, string> = {
    cn: '支持\`A\`. \`D\`, \`Left(左)\`, \`Right(右)\`和\`Space(空格)\`键或者鼠标滚轮翻页.',
    en: 'You can use the keyboard\'s \`A\`, \`D\`, \`Left\`, \`Right\` and \`Space\` keys or mouse wheel to page.',
    jp: '\`A\`、\`D\`、\`Left\`、\`Right\`、\`Space\`キー、またはマウスホイールでページをめくれます。',
}

function normalizeLang(inputLang: string): SupportedLang {
    if (inputLang === 'cn' || inputLang === 'jp' || inputLang === 'en') {
        return inputLang
    }
    return 'en'
}

function fillTemplate(template: string, values: Record<string, string>): string {
    return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
        const val = values[key]
        return typeof val === 'string' ? val : ''
    })
}

export function getWelcomeInstructionText(inputLang: string, homePage: string): string {
    const lang = normalizeLang(inputLang)
    return fillTemplate(welcomeInstructionTemplate[lang], {
        HOME_PAGE: homePage,
        VERSION: pkgJson.version,
    })
}

export function getBookInstructionText(inputLang: string): string {
    const lang = normalizeLang(inputLang)
    return bookInstructionTemplate[lang]
}
