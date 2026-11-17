type SupportedLang = 'cn' | 'en' | 'jp'

/**
 * 版本更新说明（本地兜底）。
 *
 * 远端 update.json 能取到时优先用远端内容；取不到（比如 raw.githubusercontent
 * 被墙）时用这份。**内容必须与 update.json 保持一致**。
 */
const versionNotesTemplate: Record<SupportedLang, string> = {
    cn: `### v1.2.8
- 触发 Cloudflare 人机验证时不再直接报错。插件会把验证界面搬进自己的窗口，就地完成后自动重新加载
- 如果内嵌的验证一直无法完成，可以「在新窗口打开」，或关掉窗口直接在页面上验证
- 适用于 nhentai / e-hentai

### v1.2.7
- 移动端改为文档滚动：底部地址栏可以正常收起了，顶栏滚动时吸顶，页码固定在右下角
- 修复 nhentai 初始化 403：上一版为了让页面能滚动，把宿主页面内容整个从渲染树里删掉了，Cloudflare 的验证容器也一起消失，脚本请求因此一直被挑战
- 修复「版本更新说明」弹窗显示上游旧内容的问题
- 书页模式仍是单屏显示，不受影响

### v1.2.6
- 超分输出校验改为只在首帧做一次，主线程阻塞减半
- 切换输出编码不再重建着色器程序
- 页面菜单的全局监听从「每页一份」改成一份
- 状态浮层的周期性重算从 7 项降到 2 项`,
    en: `### v1.2.8
- No longer errors out when Cloudflare asks for human verification. The check is brought into the extension's own dialog, and the page reloads automatically once you pass
- If the embedded check never completes, use "Open in new window" or close the dialog and verify on the page directly
- Applies to nhentai / e-hentai

### v1.2.7
- On mobile the reader now scrolls the document, so the bottom address bar collapses normally; the top bar sticks while scrolling and the page counter stays in the corner
- Fixed nhentai failing to initialize with 403: to enable page scrolling, the host page's content had been removed from the render tree entirely, taking Cloudflare's verification container with it, so script requests kept being challenged
- Fixed the "what's new" dialog showing old upstream content
- Book mode is still a single screen and unaffected

### v1.2.6
- The super-resolution output check now runs on the first frame only, halving main-thread blocking
- Switching output encoding no longer rebuilds shader programs
- The page menu's global listener went from one per page to one total
- The stats overlay's periodic recompute dropped from 7 items to 2`,
    jp: `### v1.2.8
- Cloudflare の本人確認が求められた際にエラーで止まらなくなった。確認画面を拡張機能のウィンドウ内に表示し、完了すると自動的に再読み込みする
- 埋め込みの確認が完了しない場合は「新しいウィンドウで開く」を使うか、画面を閉じてページ上で確認してください
- nhentai / e-hentai に対応

### v1.2.7
- モバイルは文書スクロールに変更し、下部のアドレスバーが正常に収納される。トップバーはスクロール時に吸着し、ページ番号は右下に固定
- nhentai の初期化 403 を修正：ページをスクロール可能にするためホストページの内容を描画ツリーから丸ごと外しており、Cloudflare の検証コンテナも消えていたため、スクリプトのリクエストが挑戦され続けていた
- 「バージョン更新の説明」が上流の古い内容を表示する問題を修正
- ブックモードは従来どおり1画面表示で影響なし

### v1.2.6
- 超解像の出力検証を初回フレームのみに変更し、メインスレッドのブロックを半減
- 出力エンコードの切り替えでシェーダプログラムを再構築しない
- ページメニューのグローバルリスナーを「ページごと」から1つに削減
- ステータスオーバーレイの定期再計算を 7 項目から 2 項目に削減`,
}

function normalizeLang(inputLang: string): SupportedLang {
    if (inputLang === 'cn' || inputLang === 'jp' || inputLang === 'en') {
        return inputLang
    }
    return 'en'
}

export function getVersionNotesText(inputLang: string): string {
    const lang = normalizeLang(inputLang)
    return versionNotesTemplate[lang]
}
