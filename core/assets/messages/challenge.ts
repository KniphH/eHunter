/** Cloudflare 验证提示（验证页是自动弹出的顶层标签） */
export const challenge: Record<string, { cn: string, en: string, jp: string }> = {
    cfTitle: {
        cn: '站点需要验证',
        en: 'Site verification required',
        jp: 'サイトの本人確認が必要です'
    },
    cfHint: {
        cn: '已经为你打开了验证页面，在那里完成验证就行。通过后这里会自动收起，内容会自己重新加载。',
        en: 'A verification tab has been opened for you. Finish it there — this closes by itself and the content reloads.',
        jp: '確認ページを開きました。そちらで完了してください。完了すると自動的に閉じ、内容が再読み込みされます。'
    },
    cfPassed: {
        cn: '验证已通过，正在重新加载内容…',
        en: 'Verification passed. Reloading content…',
        jp: '確認が完了しました。内容を再読み込みしています…'
    },
    cfFallback: {
        cn: '如果没有看到新标签页，说明被浏览器拦了；允许弹出窗口后重试，或手动打开该地址完成验证。',
        en: 'No tab appeared? The browser blocked it. Allow pop-ups and retry, or open the address manually.',
        jp: 'タブが開かない場合はブラウザにブロックされています。ポップアップを許可して再試行するか、手動で開いてください。'
    },
    cfClose: {
        cn: '关闭',
        en: 'Close',
        jp: '閉じる'
    },
}
