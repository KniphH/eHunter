/** 像素超分与算法文件管理 */
export const superres: Record<string, { cn: string, en: string, jp: string }> = {
    superResolution: {
        cn: '像素超分',
        en: 'Super resolution',
        jp: '超解像'
    },
    superResolutionTip: {
        cn: '用你自己选的 .glsl 算法文件（Anime4K 等）对图片做超分，先到下方「超分算法文件」里选文件',
        en: 'Upscale pages with your own .glsl shader files (Anime4K etc.); pick files in "Super resolution shaders" first',
        jp: '自分で選んだ .glsl シェーダー（Anime4K など）で超解像します。先に「超解像シェーダー」でファイルを選択してください'
    },
    superResEncode: {
        cn: '输出编码',
        en: 'Output encoding',
        jp: '出力エンコード'
    },
    superResEncodeTip: {
        cn: '同一张 2560×3440 的实测：PNG 11.3MB / 编码 0.36s / 解码 0.11s，WebP 0.55MB / 0.68s / 0.07s，JPEG 0.93MB / 0.08s / 0.03s。PNG 无损、出图比 WebP 快一倍，但最吃内存（8 页缓存约 90MB）；WebP 体积只有 1/20、解码更快，代价是每页多等约 0.3s；JPEG 最快最省，但有损压缩会在细线和小字上留下痕迹。',
        en: 'Measured on the same 2560×3440 page: PNG 11.3MB / encode 0.36s / decode 0.11s, WebP 0.55MB / 0.68s / 0.07s, JPEG 0.93MB / 0.08s / 0.03s. PNG is lossless and twice as fast to encode as WebP, but it is the heaviest in memory (~90MB for 8 cached pages). WebP is 1/20 the size and decodes faster, at ~0.3s extra encoding per page. JPEG is fastest and lightest, but lossy — fine lines and small text pick up artifacts.',
        jp: '同じ 2560×3440 の実測：PNG 11.3MB / エンコード 0.36s / デコード 0.11s、WebP 0.55MB / 0.68s / 0.07s、JPEG 0.93MB / 0.08s / 0.03s。PNG は可逆で WebP より 2 倍速く書き出せますが、メモリを最も食います（8 ページで約 90MB）。WebP は 1/20 のサイズでデコードも速く、代わりに 1 ページあたり約 0.3s 余分にかかります。JPEG は最速・最軽量ですが非可逆で、細い線や小さい文字に劣化が残ります。'
    },
    superResEncodePng: {
        cn: 'PNG（默认，无损）',
        en: 'PNG (default, lossless)',
        jp: 'PNG（既定・可逆）'
    },
    superResEncodeWebp: {
        cn: 'WebP（体积最小）',
        en: 'WebP (smallest)',
        jp: 'WebP（最小サイズ）'
    },
    superResEncodeJpeg: {
        cn: 'JPEG（最快，有损）',
        en: 'JPEG (fastest, lossy)',
        jp: 'JPEG（最速・非可逆）'
    },
    superResolutionShaders: {
        cn: '超分算法文件',
        en: 'Super resolution shaders',
        jp: '超解像シェーダー'
    },
    superResolutionShadersTip: {
        cn: '按从上到下的顺序依次执行：第 1 个先跑，最后一个最后跑。文件名后面的数字是它包含的 pass 数，逐张累加。多选时文件顺序由系统排序决定，可以用每行右侧的箭头调整。',
        en: 'Runs top to bottom: the first file executes first, the last one last. The number is that file\'s pass count, added up in sequence. Multi-select order follows the system sort, so use the arrows on each row to fix it.',
        jp: '上から下へ順番に実行します。1 番目が最初、最後のものが最後です。数字はそのファイルのパス数で、順に積み上がります。複数選択時の順序はシステムの並び順になるため、各行の矢印で調整してください。'
    },
    superResolutionConfigure: {
        cn: '选择算法文件…',
        en: 'Choose shader files…',
        jp: 'シェーダーを選択…'
    },
    superResolutionEmpty: {
        cn: '尚未选择算法文件',
        en: 'No shader selected',
        jp: 'シェーダー未選択'
    },
    superResolutionLoaded: {
        cn: '已载入',
        en: 'Loaded',
        jp: '読み込み済み'
    },
    superResolutionPassCount: {
        cn: '个 pass',
        en: 'passes',
        jp: 'パス'
    },
    superResolutionClear: {
        cn: '清除',
        en: 'Clear',
        jp: 'クリア'
    },
    superResolutionCacheInfo: {
        cn: '已缓存',
        en: 'Cached',
        jp: 'キャッシュ'
    },
    superResolutionOrder: {
        cn: '执行顺序',
        en: 'Execution order',
        jp: '実行順序'
    },
    superResolutionStepFirst: {
        cn: '先',
        en: 'first',
        jp: '最初'
    },
    superResolutionStepLast: {
        cn: '最后',
        en: 'last',
        jp: '最後'
    },
    superResolutionMoveUp: {
        cn: '上移（更早执行）',
        en: 'Move up (runs earlier)',
        jp: '上へ（先に実行）'
    },
    superResolutionMoveDown: {
        cn: '下移（更晚执行）',
        en: 'Move down (runs later)',
        jp: '下へ（後に実行）'
    },
}
