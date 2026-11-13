/** 设置面板、快捷键编辑、版本与通用动作 */
export const settings: Record<string, { cn: string, en: string, jp: string }> = {
    settingsGeneral: {
        cn: '通用',
        en: 'General',
        jp: '一般'
    },
    settingsScrollMode: {
        cn: '滚动模式',
        en: 'Scroll mode',
        jp: 'スクロールモード'
    },
    settingsBookMode: {
        cn: '书页模式',
        en: 'Book mode',
        jp: 'ページモード'
    },
    settingsQuick: {
        cn: '快捷设置',
        en: 'Quick settings',
        jp: 'クイック設定'
    },
    settingsShortcuts: {
        cn: '快捷键',
        en: 'Shortcuts',
        jp: 'ショートカット'
    },
    shortcutEditHint: {
        cn: '点击 + 从固定列表新增快捷键，点击快捷键上的 × 可删除。',
        en: 'Click + to add from fixed options, click × on a shortcut to remove it.',
        jp: '＋で固定リストから追加し、ショートカットの×で削除します。'
    },
    shortcutAddPlaceholder: {
        cn: '选择快捷键',
        en: 'Select key',
        jp: 'キーを選択'
    },
    currentShortcut: {
        cn: '当前',
        en: 'Current',
        jp: '現在'
    },
    shortcutResetLabel: {
        cn: '恢复默认快捷键',
        en: 'Restore default shortcuts',
        jp: 'デフォルトのショートカットを復元'
    },
    shortcutResetAction: {
        cn: '恢复默认',
        en: 'Reset',
        jp: 'リセット'
    },
    shortcutGoPrev: {
        cn: '上一页',
        en: 'Previous page',
        jp: '前のページ'
    },
    shortcutGoPrevTip: {
        cn: '滚动模式前进/后退中的后退动作',
        en: 'Move to previous page/segment',
        jp: '前のページ/セグメントへ移動'
    },
    shortcutGoNext: {
        cn: '下一页',
        en: 'Next page',
        jp: '次のページ'
    },
    shortcutGoNextTip: {
        cn: '滚动模式前进/后退中的前进动作',
        en: 'Move to next page/segment',
        jp: '次のページ/セグメントへ移動'
    },
    shortcutToggleMoreSettings: {
        cn: '更多设置开关',
        en: 'Toggle more settings',
        jp: '詳細設定の表示切替'
    },
    shortcutToggleMoreSettingsTip: {
        cn: '显示或关闭更多设置弹窗',
        en: 'Open/close more settings modal',
        jp: '詳細設定モーダルを開閉'
    },
    shortcutToggleTopBar: {
        cn: '顶栏开关',
        en: 'Toggle top bar',
        jp: 'トップバー表示切替'
    },
    shortcutToggleTopBarTip: {
        cn: '显示或隐藏顶部工具栏',
        en: 'Show/hide top toolbar',
        jp: '上部ツールバーを表示/非表示'
    },
    shortcutToggleThumbView: {
        cn: '缩略图栏开关',
        en: 'Toggle thumbnails',
        jp: 'サムネイル表示切替'
    },
    shortcutToggleThumbViewTip: {
        cn: '滚动/书页模式下切换缩略图栏显示',
        en: 'Show/hide thumbnail panel in current mode',
        jp: '現在モードのサムネイルパネル表示切替'
    },
    shortcutToggleQuickPreview: {
        cn: '快速预览开关',
        en: 'Toggle quick preview',
        jp: 'クイックプレビュー切替'
    },
    shortcutToggleQuickPreviewTip: {
        cn: '打开/关闭快速预览',
        en: 'Open/close quick preview',
        jp: 'クイックプレビューを開閉'
    },
    shortcutIncreaseWidthScale: {
        cn: '调大页面比例',
        en: 'Increase page scale',
        jp: 'ページ倍率を上げる'
    },
    shortcutIncreaseWidthScaleTip: {
        cn: '每次增加 5%',
        en: 'Increase scale by 5%',
        jp: '倍率を5%増加'
    },
    shortcutDecreaseWidthScale: {
        cn: '调小页面比例',
        en: 'Decrease page scale',
        jp: 'ページ倍率を下げる'
    },
    shortcutDecreaseWidthScaleTip: {
        cn: '每次减少 5%',
        en: 'Decrease scale by 5%',
        jp: '倍率を5%減少'
    },
    shortcutTogglePagination: {
        cn: '页目录开关',
        en: 'Toggle pagination',
        jp: 'ページネーション切替'
    },
    shortcutTogglePaginationTip: {
        cn: '书页模式下显示/隐藏页目录（默认未绑定）',
        en: 'Show/hide pagination in book mode (unbound by default)',
        jp: '見開きモードでページネーションを表示/非表示（初期値未割当）'
    },
    shortcutToggleAutoFlip: {
        cn: '自动翻页开关',
        en: 'Toggle auto flip',
        jp: '自動ページめくり切替'
    },
    shortcutToggleAutoFlipTip: {
        cn: '书页模式下开关自动翻页（默认未绑定）',
        en: 'Toggle auto flip in book mode (unbound by default)',
        jp: 'ページモードの自動めくり切替（初期未設定）'
    },
    shortcutToggleOddEven: {
        cn: '奇偶切换开关',
        en: 'Toggle odd/even',
        jp: '奇偶切替'
    },
    shortcutToggleOddEvenTip: {
        cn: '书页模式下切换奇偶页拼接（默认未绑定）',
        en: 'Toggle odd/even stitching in book mode (unbound by default)',
        jp: 'ページモードの奇偶ページ結合切替（初期未設定）'
    },
    languageSetting: {
        cn: '语言',
        en: 'Language',
        jp: '言語'
    },
    languageSettingTip: {
        cn: '语言/Language/言語',
        en: '语言/Language/言語',
        jp: '语言/Language/言語'
    },
    settingsOther: {
        cn: '其他',
        en: 'Other',
        jp: 'その他'
    },
    resetAllConfirmTitle: {
        cn: '确认清空缓存并重置设置',
        en: 'Confirm cache clear and reset',
        jp: 'キャッシュ削除と設定リセットを確認'
    },
    resetAllConfirmDesc: {
        cn: '该操作会清空缓存并恢复所有设置为默认值，且不可撤销。',
        en: 'This clears cache and restores all settings to default, and cannot be undone.',
        jp: 'この操作はキャッシュを削除し、すべての設定を初期値に戻します。取り消しできません。'
    },
    versionLabel: {
        cn: '版本号',
        en: 'Version',
        jp: 'バージョン'
    },
    enabled: {
        cn: '已启用',
        en: 'Enabled',
        jp: '有効'
    },
    hidden: {
        cn: '已隐藏',
        en: 'Hidden',
        jp: '非表示'
    },
    quickDragHint: {
        cn: '拖拽设置项可调整顺序，并可在上下区域间移动来控制显示。',
        en: 'Drag items to reorder, and move between sections to show or hide.',
        jp: 'ドラッグで並び替え、上下の領域間移動で表示/非表示を切り替えます。'
    },
    quickEnabledHint: {
        cn: '这些会显示在顶部快捷栏',
        en: 'Shown in top quick bar',
        jp: '上部クイックバーに表示'
    },
    quickHiddenHint: {
        cn: '这些不会显示在顶部快捷栏',
        en: 'Hidden from top quick bar',
        jp: '上部クイックバーに非表示'
    },
    disabled: {
        cn: '已禁用',
        en: 'Disabled',
        jp: '無効'
    },
    confirm: {
        cn: '确定',
        en: 'CONFIRM',
        jp: '確認'
    },
    cancel: {
        cn: '取消',
        en: 'CANCEL',
        jp: '取り消し'
    },
    infoTip: {
        cn: '查看说明和关于',
        en: 'Look the Instructions and About',
        jp: '指示と情報を見てください'
    },
    resetTip: {
        cn: '重置缓存和数据',
        en: 'Reset cache and data',
        jp: 'Reset cache and data'
    },
    githubTip: {
        cn: '前往项目主页(Github)',
        en: 'Go to the project home page(Github)',
        jp: 'プロジェクトのホームページに行く(Github)'
    },
    instructionsAndAbouts: {
        cn: '说明和关于',
        en: 'Instructions & About',
        jp: '説明と概要'
    },
    instructions: {
        cn: '说明',
        en: 'Instructions',
        jp: '説明'
    },
    later: {
        cn: '以后再说',
        en: 'LATER',
        jp: '後で'
    },
    versionUpdate: {
        cn: '版本更新说明',
        en: 'The update of this version',
        jp: 'このバージョンの更新'
    },
    version: {
        cn: '版本',
        en: 'Version',
        jp: 'Version'
    },
    ContractAuthor: {
        cn: '联系作者',
        en: 'Contact author',
        jp: '作者に連絡する'
    },
}
