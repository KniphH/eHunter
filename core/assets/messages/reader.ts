/** 阅读模式、页面比例、分卷、缩略图、滚轮与页边距 */
export const reader: Record<string, { cn: string, en: string, jp: string }> = {
    readingMode: {
        cn: '阅读模式',
        en: 'Mode',
        jp: 'モード'
    },
    readingModeTip: {
        cn: '设置阅读模式',
        en: 'Change reading mode',
        jp: '読むモードを変更する'
    },
    scrollMode: {
        cn: '滚动',
        en: 'Scroll',
        jp: 'スクロール'
    },
    bookMode: {
        cn: '书页',
        en: 'Book',
        jp: 'ページ'
    },
    widthScale: {
        cn: '页面比例',
        en: 'Page scale',
        jp: 'ページの割合'
    },
    widthScaleTip: {
        cn: '设置页面比例',
        en: 'Change page scale',
        jp: 'ページの割合を設定'
    },
    custom: {
        cn: '自定义',
        en: 'Custom',
        jp: 'カスタム'
    },
    loadNum: {
        cn: '加载页数',
        en: 'Loading quantity',
        jp: '積載量'
    },
    loadNumTip: {
        cn: '越大则对网络质量要求越高',
        en: 'The greater quantity, the higher requirement of network quality',
        jp: '数字が大きいほど、ネットワーク品質の要件が高くなります'
    },
    volSize: {
        cn: '分卷页数',
        en: 'Volume size',
        jp: 'ボリュームサイズ'
    },
    volSizeTip: {
        cn: '设置过大会导致卡顿',
        en: 'If too big, the page will be laggy',
        jp: '大きすぎると、プログラムは遅くなります'
    },
    thumbView: {
        cn: '缩略图栏',
        en: 'Thumbnail',
        jp: 'サムネイル'
    },
    thumbViewTip: {
        cn: '开启/关闭缩略图栏',
        en: 'Show/hide the column of thumbnail',
        jp: 'サムネイルの列を表示または非表示'
    },
    expandThumbs: {
        cn: '展开',
        en: 'Expand',
        jp: '展開'
    },
    screenSize: {
        cn: '同屏页数',
        en: 'Pages/screen',
        jp: 'ページ/画面'
    },
    screenSizeTip: {
        cn: '一个屏幕下的页数',
        en: 'The number of pages on the screen',
        jp: '画面上のページ数'
    },
    wheelSensitivity: {
        cn: '滚轮翻页',
        en: 'Wheel flip',
        jp: 'ホイール'
    },
    wheelSensitivityTip: {
        cn: '鼠标滚轮翻页灵敏度',
        en: 'Wheel sensitivity',
        jp: 'ホイール感度'
    },
    wheelDirection: {
        cn: '反转滚动方向',
        en: 'Wheel Direction',
        jp: 'ホイール方向'
    },
    wheelDirectionTip: {
        cn: '反转滚轮翻页方向',
        en: 'Reverse Wheel Direction to flip',
        jp: 'リバースホイール方向'
    },
    tips: {
      cn: '提示',
      en: 'TIPS',
      jp: 'ヒント'
    },
    numberInputTip: {
      cn: '最小值为`{{min}}`, 最大值为`{{max}}`',
      en: 'The minimum is `{{min}}` and the maximum is `{{max}}`',
      jp: '最小は`{{min}}`, 最大は`{{max}}`です'
    },
    pageMargin: {
      cn: '页间隔',
      en: 'Page spacing',
      jp: 'ページ間隔'
    },
    pageMarginTip: {
      cn: '页间隔',
      en: 'Page spacing',
      jp: 'ページ間隔'
    },
}
