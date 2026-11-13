/** 详细信息浮层 */
export const stats: Record<string, { cn: string, en: string, jp: string }> = {
    statsTitle: {
      cn: '详细状态',
      en: 'Statistics',
      jp: '統計情報'
    },
    statsCopy: {
      cn: '复制',
      en: 'Copy',
      jp: 'コピー'
    },
    statsReset: {
      cn: '清空',
      en: 'Reset',
      jp: 'リセット'
    },
    statsClose: {
      cn: '关闭（Esc）',
      en: 'Close (Esc)',
      jp: '閉じる (Esc)'
    },
    statsHint: {
      cn: '页面菜单 / 右键打开 · 拖动标题栏移动 · Esc 关闭',
      en: 'Open from page menu or right-click · drag the title bar · Esc closes',
      jp: 'ページメニュー / 右クリックで開く · タイトルバーをドラッグで移動 · Esc で閉じる'
    },
    statsSectionPage: {
      cn: '当前页',
      en: 'Current page',
      jp: '現在のページ'
    },
    statsSectionAlbum: {
      cn: '整本进度',
      en: 'Album progress',
      jp: '全体の進捗'
    },
    statsOriginalSize: {
      cn: '原图尺寸',
      en: 'Original size',
      jp: '原寸'
    },
    statsSuperSize: {
      cn: '超分尺寸',
      en: 'Upscaled size',
      jp: '超解像サイズ'
    },
    statsOriginalBytes: {
      cn: '原图体积',
      en: 'Original file size',
      jp: '原寸ファイル容量'
    },
    statsSuperBytes: {
      cn: '超分体积',
      en: 'Upscaled file size',
      jp: '超解像ファイル容量'
    },
    statsLoadedPages: {
      cn: '已加载',
      en: 'Loaded',
      jp: '読込済'
    },
    statsLoadingPages: {
      cn: '正在加载',
      en: 'Loading now',
      jp: '読込中'
    },
    statsFailedPages: {
      cn: '失败',
      en: 'Failed',
      jp: '失敗'
    },
    statsPendingPages: {
      cn: '未开始',
      en: 'Not yet',
      jp: '未着手'
    },
    statsAvgLoadMs: {
      cn: '平均耗时',
      en: 'Avg load',
      jp: '平均時間'
    },
    statsOriginalTotal: {
      cn: '原图合计',
      en: 'Original total',
      jp: '原寸合計'
    },
    statsSuperTotal: {
      cn: '超分合计',
      en: 'Upscaled total',
      jp: '超解像合計'
    },
    statsPagesUnit: {
      cn: '页',
      en: 'pages',
      jp: 'ページ'
    },
    statsLastRenderSize: {
      cn: '输出体积',
      en: 'Output size',
      jp: '出力容量'
    },
    statsSectionNet: {
      cn: '图片网络',
      en: 'Image network',
      jp: '画像通信'
    },
    statsSectionSuperRes: {
      cn: '超分',
      en: 'Super resolution',
      jp: '超解像'
    },
    statsSectionEnv: {
      cn: '环境',
      en: 'Environment',
      jp: '環境'
    },
    statsNoData: {
      cn: '暂无数据',
      en: 'No data',
      jp: 'データなし'
    },
    statsPageIndex: {
      cn: '页码',
      en: 'Page',
      jp: 'ページ'
    },
    statsMode: {
      cn: '取址模式',
      en: 'Source mode',
      jp: '取得モード'
    },
    statsModeDefault: {
      cn: '默认',
      en: 'Default',
      jp: '既定'
    },
    statsModeFast: {
      cn: '快速',
      en: 'Fast',
      jp: '高速'
    },
    statsModeOrigin: {
      cn: '原图',
      en: 'Original',
      jp: '原寸'
    },
    statsModeChangeSource: {
      cn: '换源',
      en: 'Other source',
      jp: '別ソース'
    },
    statsStatus: {
      cn: '状态',
      en: 'Status',
      jp: '状態'
    },
    statsStatusWaiting: {
      cn: '等待',
      en: 'Waiting',
      jp: '待機'
    },
    statsStatusLoading: {
      cn: '加载中',
      en: 'Loading',
      jp: '読み込み中'
    },
    statsStatusError: {
      cn: '失败',
      en: 'Failed',
      jp: '失敗'
    },
    statsStatusLoaded: {
      cn: '已加载',
      en: 'Loaded',
      jp: '読込済'
    },
    statsRunning: {
      cn: '进行中',
      en: 'running',
      jp: '実行中'
    },
    statsPaused: {
      cn: '已暂停（页面不可见）',
      en: 'paused (page invisible)',
      jp: '一時停止（非表示）'
    },
    statsSession: {
      cn: '本次会话',
      en: 'Session',
      jp: '今回のセッション'
    },
    statsAttempts: {
      cn: '尝试',
      en: 'attempts',
      jp: '試行'
    },
    statsFetchMs: {
      cn: '取址耗时',
      en: 'Resolve time',
      jp: '取得時間'
    },
    statsDisplaySize: {
      cn: '显示尺寸',
      en: 'Display size',
      jp: '表示サイズ'
    },
    statsSuperResLine: {
      cn: '超分结果',
      en: 'Upscaled',
      jp: '超解像結果'
    },
    statsSuperResSlow: {
      cn: '超分时间过长',
      en: 'super-resolution is slow',
      jp: '超解像に時間がかかっています'
    },
    statsDisplayKind: {
      cn: '图片来源',
      en: 'Source of image',
      jp: '画像の出所'
    },
    statsKindNone: {
      cn: '无',
      en: 'none',
      jp: 'なし'
    },
    statsKindUrl: {
      cn: '原地址',
      en: 'direct URL',
      jp: '元 URL'
    },
    statsKindThumb: {
      cn: '缩略图',
      en: 'thumbnail',
      jp: 'サムネイル'
    },
    statsKindBlob: {
      cn: '兜底通道',
      en: 'fallback channel',
      jp: '代替経路'
    },
    statsKindSuperres: {
      cn: '超分结果',
      en: 'super-resolved',
      jp: '超解像結果'
    },
    statsSrcHost: {
      cn: '图片域',
      en: 'Image host',
      jp: '画像ホスト'
    },
    statsLastError: {
      cn: '最近错误',
      en: 'Last error',
      jp: '直近のエラー'
    },
    statsTotal: {
      cn: '累计',
      en: 'Total',
      jp: '累計'
    },
    statsTimes: {
      cn: '次',
      en: 'req',
      jp: '回'
    },
    statsFailCount: {
      cn: '失败',
      en: 'Failed',
      jp: '失敗'
    },
    statsAvgSpeed: {
      cn: '平均速度',
      en: 'Avg speed',
      jp: '平均速度'
    },
    statsEnabled: {
      cn: '开启',
      en: 'on',
      jp: 'オン'
    },
    statsDisabled: {
      cn: '关闭',
      en: 'off',
      jp: 'オフ'
    },
    statsShaderCount: {
      cn: '着色器',
      en: 'Shaders',
      jp: 'シェーダ'
    },
    statsOutEncode: {
      cn: '输出编码',
      en: 'Encoding',
      jp: 'エンコード'
    },
    statsChain: {
      cn: '执行顺序',
      en: 'Chain',
      jp: '実行順'
    },
    statsCache: {
      cn: '缓存',
      en: 'Cache',
      jp: 'キャッシュ'
    },
    statsHit: {
      cn: '命中',
      en: 'hit',
      jp: 'ヒット'
    },
    statsMiss: {
      cn: '未命中',
      en: 'miss',
      jp: 'ミス'
    },
    statsQueued: {
      cn: '排队',
      en: 'queued',
      jp: '待ち'
    },
    statsLastRender: {
      cn: '最近渲染',
      en: 'Last render',
      jp: '直近の描画'
    },
    statsBreakdown: {
      cn: '渲染拆解',
      en: 'Breakdown',
      jp: '内訳'
    },
    statsDecode: {
      cn: '解码',
      en: 'decode',
      jp: 'デコード'
    },
    statsGpu: {
      cn: '图形',
      en: 'gpu',
      jp: 'GPU'
    },
    statsEncode: {
      cn: '编码',
      en: 'encode',
      jp: 'エンコード'
    },
    statsTotalMs: {
      cn: '合计',
      en: 'total',
      jp: '合計'
    },
    statsPassUnit: {
      cn: 'pass',
      en: 'passes',
      jp: 'pass'
    },
    statsVersion: {
      cn: '版本',
      en: 'Version',
      jp: 'バージョン'
    },
    statsViewport: {
      cn: '视口',
      en: 'Viewport',
      jp: 'ビューポート'
    },
    statsFps: {
      cn: '帧率',
      en: 'FPS',
      jp: 'FPS'
    },
    statsHeap: {
      cn: 'JS 堆',
      en: 'JS heap',
      jp: 'JS ヒープ'
    },
    statsNodeUnit: {
      cn: '节点',
      en: 'nodes',
      jp: 'ノード'
    },
    statsMenuEntry: {
      cn: '详细信息',
      en: 'Statistics',
      jp: '統計情報'
    }
}
