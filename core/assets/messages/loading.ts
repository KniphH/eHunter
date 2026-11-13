/** 图片加载、失败重试与原图/换源 */
export const loading: Record<string, { cn: string, en: string, jp: string }> = {
    refresh: {
        cn: '刷新',
        en: 'Refresh',
        jp: 'リフレッシュ'
    },
    refreshTip: {
        cn: '再次获取普通图片',
        en: 'Refresh to load normal image',
        jp: 'リフレッシュ; 通常の画像を読み込みます'
    },
    originImg: {
        cn: '原图',
        en: 'Original',
        jp: '元画像'
    },
    originImgTip: {
        cn: '加载原图',
        en: 'Load original image',
        jp: '元画像を読み込む'
    },
    refreshByOtherSource: {
        cn: '换源刷新',
        en: 'Other source',
        jp: '他のサーバー'
    },
    refreshByOtherSourceTip: {
        cn: '从其他服务器获取普通图片',
        en: 'Load normal image from other server',
        jp: '他のサーバーから通常の画像を取得する'
    },
    loadingImg: {
        cn: '加载图片中...',
        en: 'Loading image...',
        jp: '画像を読み込む..'
    },
    loadingImgUrl: {
        cn: '加载图片地址中...',
        en: 'Loading image url..',
        jp: '画像URLを読み込む..'
    },
    reload: {
        cn: '重载',
        en: 'Reload',
        jp: 'リロード'
    },
    loadingImgFailed: {
        cn: '加载图片失败, 请刷新',
        en: 'Loading failed, please refresh',
        jp: '読み込みに失敗しました。更新してください'
    },
    autoRetryIn: {
        cn: '{sec} 秒后自动重试',
        en: 'retrying in {sec}s',
        jp: '{sec} 秒後に自動再試行'
    },
    noOriginalImg: {
        cn: '无原图, 请刷新',
        en: 'No original Image, please refresh',
        jp: 'オリジナルイメージはありません。リフレッシュしてください'
    },
    loadingFailed: {
        cn: '加载错误',
        en: 'Loading failed',
        jp: '読み込み失敗'
    },
    imgLoaded: {
        cn: '图片加载完成',
        en: 'Image loaded',
        jp: '画像が読み込まれた'
    },
    waiting: {
        cn: '等待中..',
        en: 'Waiting..',
        jp: '待っている..'
    },
    autoSourceRetry: {
        cn: '自动换源重试',
        en: 'Auto source retry',
        jp: '自動ソース再試行'
    },
    autoSourceRetryTip: {
        cn: '加载失败时自动尝试换源',
        en: 'Automatically retry with another source when loading fails',
        jp: '読み込み失敗時に別ソースで自動再試行'
    },
    changingToSmallFailed: {
        cn: '无缝切换至`"Normal"`模式失败，可能是网络错误，可刷新重试或者返回前一页将预览图的大小模式切换为`"Normal"`。',
        en: 'Changing to `"Normal"` mode failed, because of poor network. You can reload this page or go back to previous page and change the mode of thumbnails to `"Normal"`',
        jp: 'ネットワークが不十分であるため、`「Normal」`モードに変更できませんでした。 このページをリロードするか、前のページに戻ってサムネイルのモードを`「Normal」`に変更することができます'
    },
    loadingTip: {
        cn: '在前页采用Normal模式查看缩略图可加速加载',
        en: 'You can use "Normal" mode of thumbnail in previous page to accelerate the load.',
        jp: '前のページでサムネイルの「Normal」モードを使用して、読み込みを高速化できます。'
    },
    loadingFailedAndRefresh: {
        cn: '加载错误, 刷新重试',
        en: 'Loading failed, please refresh to retry',
        jp: '読み込みに失敗しました。もう一度試してください'
    },
    failedMsg: {
        cn: '错误信息',
        en: 'Error message',
        jp: 'エラーメッセージ'
    },
}
