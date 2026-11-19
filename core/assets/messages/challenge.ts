/** 需要用户去完成 Cloudflare 验证时的提示层 */
export const challenge: Record<string, { cn: string, en: string, jp: string }> = {
    cfTitle: {
        cn: '站点需要验证',
        en: 'Site verification required',
        jp: 'サイトの本人確認が必要です'
    },
    cfHint: {
        cn: '点下面的按钮，在新标签页里完成验证。验证通过后这里会自动收起，不用手动刷新。',
        en: 'Tap the button and finish the check in the new tab. This dialog closes by itself once you pass.',
        jp: '下のボタンから新しいタブで確認を完了してください。完了すると自動的に閉じます。'
    },
    cfOpenExternal: {
        cn: '打开验证页面',
        en: 'Open verification page',
        jp: '確認ページを開く'
    },
    cfWaiting: {
        cn: '正在等待验证结果…',
        en: 'Waiting for verification…',
        jp: '確認結果を待っています…'
    },
    cfPollHint: {
        cn: '还没通过。在上面的新标签页完成验证后，这里会自动收起。',
        en: 'Not passed yet. Finish the check in the tab above and this will close itself.',
        jp: 'まだ完了していません。上のタブで確認を終えると自動的に閉じます。'
    },
    cfPassed: {
        cn: '验证已通过，正在重新加载内容…',
        en: 'Verification passed. Reloading content…',
        jp: '確認が完了しました。内容を再読み込みしています…'
    },
    cfFallback: {
        cn: '如果一直不通过，点右上角关闭，手动刷新页面即可。',
        en: 'If it never passes, close this and reload the page manually.',
        jp: '通らない場合は右上の×で閉じて、ページを手動で再読み込みしてください。'
    },
    cfClose: {
        cn: '关闭',
        en: 'Close',
        jp: '閉じる'
    },
}
