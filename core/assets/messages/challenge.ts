/** Cloudflare 人机验证覆盖层 */
export const challenge: Record<string, { cn: string, en: string, jp: string }> = {
    cfChallengeTitle: {
        cn: '站点需要人机验证',
        en: 'Site verification required',
        jp: 'サイトの本人確認が必要です'
    },
    cfChallengeHint: {
        cn: '请在下方完成验证。通过后会自动重新加载，不需要手动刷新。',
        en: 'Complete the check below. The page reloads automatically once you pass.',
        jp: '下記の確認を完了してください。通過すると自動的に再読み込みします。'
    },
    cfChallengeDetected: {
        cn: '检测到验证页面',
        en: 'Verification page detected',
        jp: '確認ページを検出しました'
    },
    cfChallengeOpenExternal: {
        cn: '在新窗口打开',
        en: 'Open in new window',
        jp: '新しいウィンドウで開く'
    },
    cfChallengeRefresh: {
        cn: '重新加载',
        en: 'Reload',
        jp: '再読み込み'
    },
    cfChallengeTimeout: {
        cn: '验证似乎没能完成。可以点「在新窗口打开」完成后再回来。',
        en: 'Verification did not complete. Try "Open in new window", then come back.',
        jp: '確認が完了しませんでした。「新しいウィンドウで開く」で完了してから戻ってください。'
    },
    cfChallengePassed: {
        cn: '验证通过，正在重新加载…',
        en: 'Passed. Reloading…',
        jp: '確認済み。再読み込み中…'
    },
    cfChallengeClose: {
        cn: '关闭',
        en: 'Close',
        jp: '閉じる'
    },
    cfChallengeFallback: {
        cn: '如果下方一直无法完成，请关闭这个窗口，直接在页面上完成验证。',
        en: 'If the check below never completes, close this dialog and verify on the page directly.',
        jp: '下記で完了できない場合は、この画面を閉じてページ上で直接確認してください。'
    },
}
