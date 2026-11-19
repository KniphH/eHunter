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
        cn: '验证已通过，正在重试加载失败的内容…',
        en: 'Verification passed. Retrying the failed content…',
        jp: '確認が完了しました。読み込みに失敗した内容を再試行しています…'
    },
    cfTimeout: {
        cn: '验证似乎没能完成。可以点「在新窗口打开」完成后再回来点重新加载。',
        en: 'The check did not complete. Try "Open in new window", then come back and reload.',
        jp: '確認が完了しませんでした。「新しいウィンドウで開く」で完了してから再読み込みしてください。'
    },
    cfFallback: {
        cn: '通常几秒后会自动关闭；如果一直停在这里，点右上角关闭即可，内容会自行重试。',
        en: 'This usually closes by itself in a few seconds. If it stays, close it — content will retry on its own.',
        jp: '通常は数秒で自動的に閉じます。閉じない場合は右上の×で閉じてください。内容は自動で再試行されます。'
    },
    cfOpenExternal: {
        cn: '在新窗口打开',
        en: 'Open in new window',
        jp: '新しいウィンドウで開く'
    },
    cfReload: {
        cn: '手动刷新页面',
        en: 'Reload page manually',
        jp: '手動でページを再読み込み'
    },
    cfClose: {
        cn: '关闭',
        en: 'Close',
        jp: '閉じる'
    },
}
