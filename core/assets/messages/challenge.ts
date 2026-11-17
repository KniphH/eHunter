/** 运行中被 Cloudflare 挑战时的验证弹层 */
export const challenge: Record<string, { cn: string, en: string, jp: string }> = {
    cfTitle: {
        cn: '需要完成一次验证',
        en: 'Verification needed',
        jp: '本人確認が必要です'
    },
    cfHint: {
        cn: '站点要求验证，完成下面这一步就会带着当前进度自动重新加载。',
        en: 'The site is asking for a check. Finish it below and the page reloads at your current position.',
        jp: 'サイトが確認を求めています。下記を完了すると現在の位置から自動的に再読み込みします。'
    },
    cfPassed: {
        cn: '验证通过，正在恢复阅读位置…',
        en: 'Passed. Restoring your position…',
        jp: '確認済み。読んでいた位置に戻ります…'
    },
    cfTimeout: {
        cn: '验证似乎没能完成。可以点「在新窗口打开」完成后再回来点重新加载。',
        en: 'The check did not complete. Try "Open in new window", then come back and reload.',
        jp: '確認が完了しませんでした。「新しいウィンドウで開く」で完了してから再読み込みしてください。'
    },
    cfFallback: {
        cn: '如果下面一直空白或无法完成，请关闭此窗口，刷新页面后重试。',
        en: 'If the frame below stays blank, close this dialog and reload the page.',
        jp: '下記が空白のままの場合は、この画面を閉じてページを再読み込みしてください。'
    },
    cfOpenExternal: {
        cn: '在新窗口打开',
        en: 'Open in new window',
        jp: '新しいウィンドウで開く'
    },
    cfReload: {
        cn: '重新加载',
        en: 'Reload',
        jp: '再読み込み'
    },
    cfClose: {
        cn: '关闭',
        en: 'Close',
        jp: '閉じる'
    },
}
