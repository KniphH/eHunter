/** Cloudflare 验证提示（验证页是自动弹出的顶层标签） */
export const challenge: Record<string, { cn: string, en: string, jp: string }> = {
    cfTitle: {
        cn: '站点需要验证',
        en: 'Site verification required',
        jp: 'サイトの本人確認が必要です'
    },
    cfHint: {
        cn: '点下面的按钮会弹出一个验证窗口，在那里完成验证就行。通过后这里会自动收起，内容会自己重新加载。',
        en: 'The button below opens a small verification window. Finish it there — this closes by itself and the content reloads.',
        jp: '下のボタンで確認用の小ウィンドウが開きます。そちらで完了すると自動的に閉じ、内容が再読み込みされます。'
    },
    cfOpenWindow: {
        cn: '打开验证窗口',
        en: 'Open verification window',
        jp: '確認ウィンドウを開く'
    },
    cfWaiting: {
        cn: '正在等待验证结果…',
        en: 'Waiting for verification…',
        jp: '確認結果を待っています…'
    },
    cfPassed: {
        cn: '验证已通过，正在重新加载内容…',
        en: 'Verification passed. Reloading content…',
        jp: '確認が完了しました。内容を再読み込みしています…'
    },
    cfFallback: {
        cn: '如果窗口没出来，是浏览器拦了弹窗；允许本站弹窗后重新点一次即可。',
        en: 'If no window appeared, the browser blocked it. Allow pop-ups for this site and press the button again.',
        jp: 'ウィンドウが開かない場合はブラウザにブロックされています。このサイトのポップアップを許可して再度お試しください。'
    },
    cfClose: {
        cn: '关闭',
        en: 'Close',
        jp: '閉じる'
    },
}
