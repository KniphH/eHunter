/** 相册下载 */
export const download: Record<string, { cn: string, en: string, jp: string }> = {
    download: {
        cn: '下载',
        en: 'Download',
        jp: 'ダウンロード'
    },
    downloadConfirmTitle: {
        cn: '下载确认',
        en: 'Download confirmation',
        jp: 'ダウンロード確認'
    },
    downloadConfirmMessage: {
        cn: '是否下载该画廊的所有图片？',
        en: 'Download all images from this gallery?',
        jp: 'このギャラリーのすべての画像をダウンロードしますか？'
    },
    downloadAuthorizeTip: {
        cn: '**提示：** 下载时可能会弹出授权提示，仅用于获取图片并打包下载，请放心授权。',
        en: '**Tip:** You may see an authorization prompt during download. It is only used to fetch images and create the zip package.',
        jp: '**ヒント：** ダウンロード中に権限確認が表示される場合があります。画像取得とzip作成のためのみ使用されます。'
    },
    downloadChunkSize: {
        cn: '下载分片大小',
        en: 'Download chunk size',
        jp: 'ダウンロード分割サイズ'
    },
    downloadChunkSizeTip: {
        cn: '单个压缩包最多包含的图片页数，异常值会回退到200',
        en: 'Max images per zip; invalid values fallback to 200',
        jp: '1つのzipに含める最大画像数。無効値は200に戻す'
    },
    downloadQueued: {
        cn: '下载任务已开始',
        en: 'Download queued',
        jp: 'ダウンロード開始'
    },
    downloadNoPages: {
        cn: '无可下载页面',
        en: 'No pages to download',
        jp: 'ダウンロード対象ページなし'
    },
    downloadFetching: {
        cn: '正在处理第{{current}}/{{total}}张图片',
        en: 'Processing image {{current}} / {{total}}',
        jp: '{{current}} / {{total}} 枚目を処理中'
    },
    downloadCompressing: {
        cn: '正在压缩第{{chunk}}/{{totalChunks}}个分片',
        en: 'Compressing chunk {{chunk}} / {{totalChunks}}',
        jp: '{{chunk}} / {{totalChunks}} 分割を圧縮中'
    },
    downloadCompleted: {
        cn: '下载完成',
        en: 'Download completed',
        jp: 'ダウンロード完了'
    },
    downloadPartial: {
        cn: '下载完成，失败{{failed}}张',
        en: 'Completed with {{failed}} failures',
        jp: '完了（失敗 {{failed}} 枚）'
    },
    downloadFailed: {
        cn: '下载失败',
        en: 'Download failed',
        jp: 'ダウンロード失敗'
    },
    downloadChunkFailed: {
        cn: '分片{{chunk}}压缩失败：{{reason}}',
        en: 'Chunk {{chunk}} failed: {{reason}}',
        jp: '分割{{chunk}}失敗: {{reason}}'
    },
    downloadAborted: {
        cn: '下载已终止',
        en: 'Download aborted',
        jp: 'ダウンロードを停止しました'
    },
    terminate: {
        cn: '终止',
        en: 'Terminate',
        jp: '停止'
    },
}
