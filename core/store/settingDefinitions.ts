/**
 * 设置面板与快捷键的静态定义。
 *
 * 只有类型与数据：字段清单、下拉/数字控件声明、快捷键候选与默认绑定。
 * 读写存储、改 store 的逻辑都留在 app.ts，因此本模块可以在初始化阶段安全求值，
 * 组件直接引它也不会把整个 store 拖进来。
 */

type ModeScope = 'both' | 'scroll-only' | 'book-only'
type SettingsPanelCategory = 'general' | 'scroll' | 'book'
type SettingControlType = 'drop' | 'num' | 'switch'

export type ShortcutActionId =
    | 'goPrev'
    | 'goNext'
    | 'toggleMoreSettings'
    | 'toggleTopBar'
    | 'toggleThumbView'
    | 'toggleQuickPreview'
    | 'increaseWidthScale'
    | 'decreaseWidthScale'
    | 'togglePagination'
    | 'toggleAutoFlip'
    | 'toggleOddEven'

export type ShortcutBindingMap = Record<ShortcutActionId, string>

export interface ShortcutActionDefinition {
    id: ShortcutActionId
    labelI18nKey: string
    tipI18nKey?: string
}

export interface QuickSettingOption {
    id: string
    i18nKey: string
    modeScope: ModeScope
    fixed?: boolean
}

export interface SettingsCategory {
    id: 'general' | 'scroll' | 'book' | 'quick' | 'shortcuts' | 'other'
    i18nKey: string
}

export interface SettingFieldDefinition {
    id: string
    control: SettingControlType
    labelI18nKey: string
    tipI18nKey?: string
    modeScope: ModeScope
    showInTopBar: boolean
    showInDialog: boolean
    dialogCategory?: SettingsPanelCategory
    dropKey?: 'readingModeList' | 'bookDirection' | 'pageTurnAnimation' | 'langList' | 'superResEncodeList'
    numKey?: 'widthScale' | 'loadNum' | 'downloadChunkSize' | 'volumeSize' | 'pagesPerScreen' | 'autoFlipFrequency' | 'wheelSensitivity' | 'scrollPageMargin' | 'magnifierZoom' | 'magnifierAreaSize'
    min?: number
    max?: number
    useAbbrName?: boolean
    isFloat?: boolean
    requireThumbSupportInTopBar?: boolean
}

export const quickSettingOptions: QuickSettingOption[] = [
    { id: 'readingMode', i18nKey: 'readingMode', modeScope: 'both', fixed: true },
    { id: 'widthScale', i18nKey: 'widthScale', modeScope: 'scroll-only' },
    { id: 'loadNum', i18nKey: 'loadNum', modeScope: 'both' },
    { id: 'volumeSize', i18nKey: 'volSize', modeScope: 'scroll-only' },
    { id: 'showThumbView', i18nKey: 'thumbView', modeScope: 'scroll-only' },
    { id: 'scrollPageMargin', i18nKey: 'pageMargin', modeScope: 'scroll-only' },
    { id: 'pagesPerScreen', i18nKey: 'screenSize', modeScope: 'book-only' },
    { id: 'bookDirection', i18nKey: 'bookDirection', modeScope: 'book-only' },
    { id: 'pageTurnAnimationMode', i18nKey: 'pageTurnAnimation', modeScope: 'book-only' },
    { id: 'showBookPagination', i18nKey: 'pagination', modeScope: 'book-only' },
    { id: 'isChangeOddEven', i18nKey: 'oddEven', modeScope: 'book-only' },
    { id: 'isAutoFlip', i18nKey: 'autoFlip', modeScope: 'book-only' },
    { id: 'autoFlipFrequency', i18nKey: 'autoFlipFrequency', modeScope: 'book-only' },
    { id: 'showBookThumbView', i18nKey: 'thumbView', modeScope: 'book-only' },
    { id: 'IsReverseBookWheeFliplDirection', i18nKey: 'wheelDirection', modeScope: 'book-only' },
    { id: 'wheelSensitivity', i18nKey: 'wheelSensitivity', modeScope: 'book-only' },
    { id: 'lang', i18nKey: 'languageSetting', modeScope: 'both' },
    { id: 'autoRetryByOtherSource', i18nKey: 'autoSourceRetry', modeScope: 'both' },
]

export const settingsCategories: SettingsCategory[] = [
    { id: 'general', i18nKey: 'settingsGeneral' },
    { id: 'scroll', i18nKey: 'settingsScrollMode' },
    { id: 'book', i18nKey: 'settingsBookMode' },
    { id: 'quick', i18nKey: 'settingsQuick' },
    { id: 'shortcuts', i18nKey: 'settingsShortcuts' },
    { id: 'other', i18nKey: 'settingsOther' },
]

export const shortcutActionDefinitions: ShortcutActionDefinition[] = [
    { id: 'goPrev', labelI18nKey: 'shortcutGoPrev', tipI18nKey: 'shortcutGoPrevTip' },
    { id: 'goNext', labelI18nKey: 'shortcutGoNext', tipI18nKey: 'shortcutGoNextTip' },
    { id: 'toggleMoreSettings', labelI18nKey: 'shortcutToggleMoreSettings', tipI18nKey: 'shortcutToggleMoreSettingsTip' },
    { id: 'toggleTopBar', labelI18nKey: 'shortcutToggleTopBar', tipI18nKey: 'shortcutToggleTopBarTip' },
    { id: 'toggleThumbView', labelI18nKey: 'shortcutToggleThumbView', tipI18nKey: 'shortcutToggleThumbViewTip' },
    { id: 'toggleQuickPreview', labelI18nKey: 'shortcutToggleQuickPreview', tipI18nKey: 'shortcutToggleQuickPreviewTip' },
    { id: 'increaseWidthScale', labelI18nKey: 'shortcutIncreaseWidthScale', tipI18nKey: 'shortcutIncreaseWidthScaleTip' },
    { id: 'decreaseWidthScale', labelI18nKey: 'shortcutDecreaseWidthScale', tipI18nKey: 'shortcutDecreaseWidthScaleTip' },
    { id: 'togglePagination', labelI18nKey: 'shortcutTogglePagination', tipI18nKey: 'shortcutTogglePaginationTip' },
    { id: 'toggleAutoFlip', labelI18nKey: 'shortcutToggleAutoFlip', tipI18nKey: 'shortcutToggleAutoFlipTip' },
    { id: 'toggleOddEven', labelI18nKey: 'shortcutToggleOddEven', tipI18nKey: 'shortcutToggleOddEvenTip' },
]

export const defaultShortcutBindings: ShortcutBindingMap = {
    goPrev: 'ArrowLeft,ArrowUp,a',
    goNext: 'ArrowRight,ArrowDown,d',
    toggleMoreSettings: 'Shift',
    toggleTopBar: 'q',
    toggleThumbView: 't',
    toggleQuickPreview: 'f',
    increaseWidthScale: ']',
    decreaseWidthScale: '[',
    togglePagination: '',
    toggleAutoFlip: '',
    toggleOddEven: '',
}

export interface ShortcutKeyCandidate {
    key: string
    label: string
}

export const shortcutKeyCandidates: ShortcutKeyCandidate[] = [
    { key: 'ArrowUp', label: '↑' },
    { key: 'ArrowDown', label: '↓' },
    { key: 'ArrowLeft', label: '←' },
    { key: 'ArrowRight', label: '→' },
    { key: 'Escape', label: 'Esc' },
    { key: 'Tab', label: 'Tab' },
    { key: 'CapsLock', label: 'Caps' },
    { key: 'Control', label: 'Ctrl' },
    { key: 'Shift', label: 'Shift' },
    { key: 'F1', label: 'F1' },
    { key: 'F2', label: 'F2' },
    { key: 'F3', label: 'F3' },
    { key: 'F4', label: 'F4' },
    { key: 'F5', label: 'F5' },
    { key: 'F6', label: 'F6' },
    { key: 'F7', label: 'F7' },
    { key: 'F8', label: 'F8' },
    { key: 'F9', label: 'F9' },
    { key: 'F10', label: 'F10' },
    { key: 'F11', label: 'F11' },
    { key: 'F12', label: 'F12' },
    { key: '1', label: '1' },
    { key: '2', label: '2' },
    { key: '3', label: '3' },
    { key: '4', label: '4' },
    { key: '5', label: '5' },
    { key: '6', label: '6' },
    { key: '7', label: '7' },
    { key: '8', label: '8' },
    { key: '9', label: '9' },
    { key: '-', label: '-' },
    { key: '=', label: '=' },
    { key: '[', label: '[' },
    { key: ']', label: ']' },
    { key: 'a', label: 'A' },
    { key: 'b', label: 'B' },
    { key: 'c', label: 'C' },
    { key: 'd', label: 'D' },
    { key: 'e', label: 'E' },
    { key: 'f', label: 'F' },
    { key: 'g', label: 'G' },
    { key: 'h', label: 'H' },
    { key: 'i', label: 'I' },
    { key: 'j', label: 'J' },
    { key: 'k', label: 'K' },
    { key: 'l', label: 'L' },
    { key: 'm', label: 'M' },
    { key: 'n', label: 'N' },
    { key: 'o', label: 'O' },
    { key: 'p', label: 'P' },
    { key: 'q', label: 'Q' },
    { key: 'r', label: 'R' },
    { key: 's', label: 'S' },
    { key: 't', label: 'T' },
    { key: 'u', label: 'U' },
    { key: 'v', label: 'V' },
    { key: 'w', label: 'W' },
    { key: 'x', label: 'X' },
    { key: 'y', label: 'Y' },
    { key: 'z', label: 'Z' },
]


export const settingFieldDefinitions: SettingFieldDefinition[] = [
    {
        id: 'readingMode',
        control: 'drop',
        labelI18nKey: 'readingMode',
        tipI18nKey: 'readingModeTip',
        modeScope: 'both',
        showInTopBar: true,
        showInDialog: false,
        dropKey: 'readingModeList',
    },
    {
        id: 'lang',
        control: 'drop',
        labelI18nKey: 'languageSetting',
        tipI18nKey: 'languageSettingTip',
        modeScope: 'both',
        showInTopBar: true,
        showInDialog: true,
        dialogCategory: 'general',
        dropKey: 'langList',
        useAbbrName: true,
    },
    {
        id: 'loadNum',
        control: 'num',
        labelI18nKey: 'loadNum',
        tipI18nKey: 'loadNumTip',
        modeScope: 'both',
        showInTopBar: true,
        showInDialog: true,
        dialogCategory: 'general',
        numKey: 'loadNum',
        min: 1,
        max: 100,
    },
    {
        id: 'downloadChunkSize',
        control: 'num',
        labelI18nKey: 'downloadChunkSize',
        tipI18nKey: 'downloadChunkSizeTip',
        modeScope: 'both',
        showInTopBar: false,
        showInDialog: true,
        dialogCategory: 'general',
        numKey: 'downloadChunkSize',
        min: 1,
        max: 1000,
    },
    {
        id: 'autoRetryByOtherSource',
        control: 'switch',
        labelI18nKey: 'autoSourceRetry',
        tipI18nKey: 'autoSourceRetryTip',
        modeScope: 'both',
        showInTopBar: true,
        showInDialog: true,
        dialogCategory: 'general',
    },
    {
        id: 'superResEnabled',
        control: 'switch',
        labelI18nKey: 'superResolution',
        tipI18nKey: 'superResolutionTip',
        modeScope: 'both',
        showInTopBar: false,
        showInDialog: true,
        dialogCategory: 'general',
    },
    {
        id: 'superResEncode',
        control: 'drop',
        labelI18nKey: 'superResEncode',
        tipI18nKey: 'superResEncodeTip',
        modeScope: 'both',
        showInTopBar: false,
        showInDialog: true,
        dialogCategory: 'general',
        dropKey: 'superResEncodeList',
    },
    {
        id: 'magnifierZoom',
        control: 'num',
        labelI18nKey: 'magnifierZoom',
        tipI18nKey: 'magnifierZoomTip',
        modeScope: 'both',
        showInTopBar: false,
        showInDialog: true,
        dialogCategory: 'general',
        numKey: 'magnifierZoom',
        min: 2,
        max: 5,
    },
    {
        id: 'magnifierAreaSize',
        control: 'num',
        labelI18nKey: 'magnifierAreaSize',
        tipI18nKey: 'magnifierAreaSizeTip',
        modeScope: 'both',
        showInTopBar: false,
        showInDialog: true,
        dialogCategory: 'general',
        numKey: 'magnifierAreaSize',
        min: 20,
        max: 300,
    },
    {
        id: 'widthScale',
        control: 'num',
        labelI18nKey: 'widthScale',
        tipI18nKey: 'widthScaleTip',
        modeScope: 'scroll-only',
        showInTopBar: true,
        showInDialog: true,
        dialogCategory: 'scroll',
        numKey: 'widthScale',
        min: 30,
        max: 100,
        isFloat: true,
    },
    {
        id: 'volumeSize',
        control: 'num',
        labelI18nKey: 'volSize',
        tipI18nKey: 'volSizeTip',
        modeScope: 'scroll-only',
        showInTopBar: true,
        showInDialog: true,
        dialogCategory: 'scroll',
        numKey: 'volumeSize',
        min: 1,
        max: 200,
    },
    {
        id: 'showThumbView',
        control: 'switch',
        labelI18nKey: 'thumbView',
        tipI18nKey: 'thumbViewTip',
        modeScope: 'scroll-only',
        showInTopBar: true,
        showInDialog: true,
        dialogCategory: 'scroll',
        requireThumbSupportInTopBar: true,
    },
    {
        id: 'scrollPageMargin',
        control: 'num',
        labelI18nKey: 'pageMargin',
        tipI18nKey: 'pageMarginTip',
        modeScope: 'scroll-only',
        showInTopBar: true,
        showInDialog: true,
        dialogCategory: 'scroll',
        numKey: 'scrollPageMargin',
        min: 0,
        max: 300,
    },
    {
        id: 'pagesPerScreen',
        control: 'num',
        labelI18nKey: 'screenSize',
        tipI18nKey: 'screenSizeTip',
        modeScope: 'book-only',
        showInTopBar: true,
        showInDialog: true,
        dialogCategory: 'book',
        numKey: 'pagesPerScreen',
        min: 1,
        max: 10,
    },
    {
        id: 'bookDirection',
        control: 'drop',
        labelI18nKey: 'bookDirection',
        tipI18nKey: 'bookDirectionTip',
        modeScope: 'book-only',
        showInTopBar: true,
        showInDialog: true,
        dialogCategory: 'book',
        dropKey: 'bookDirection',
        useAbbrName: true,
    },
    {
        id: 'pageTurnAnimationMode',
        control: 'drop',
        labelI18nKey: 'pageTurnAnimation',
        tipI18nKey: 'pageTurnAnimationTip',
        modeScope: 'book-only',
        showInTopBar: true,
        showInDialog: true,
        dialogCategory: 'book',
        dropKey: 'pageTurnAnimation',
    },
    {
        id: 'showBookPagination',
        control: 'switch',
        labelI18nKey: 'pagination',
        tipI18nKey: 'paginationTip',
        modeScope: 'book-only',
        showInTopBar: true,
        showInDialog: true,
        dialogCategory: 'book',
    },
    {
        id: 'isChangeOddEven',
        control: 'switch',
        labelI18nKey: 'oddEven',
        tipI18nKey: 'oddEvenTip',
        modeScope: 'book-only',
        showInTopBar: true,
        showInDialog: true,
        dialogCategory: 'book',
    },
    {
        id: 'isAutoFlip',
        control: 'switch',
        labelI18nKey: 'autoFlip',
        tipI18nKey: 'autoFlipTip',
        modeScope: 'book-only',
        showInTopBar: true,
        showInDialog: true,
        dialogCategory: 'book',
    },
    {
        id: 'autoFlipFrequency',
        control: 'num',
        labelI18nKey: 'autoFlipFrequency',
        tipI18nKey: 'autoFlipFrequencyTip',
        modeScope: 'book-only',
        showInTopBar: true,
        showInDialog: true,
        dialogCategory: 'book',
        numKey: 'autoFlipFrequency',
        min: 1,
        max: 240,
    },
    {
        id: 'showBookThumbView',
        control: 'switch',
        labelI18nKey: 'thumbView',
        tipI18nKey: 'thumbViewTip',
        modeScope: 'book-only',
        showInTopBar: true,
        showInDialog: true,
        dialogCategory: 'book',
    },
    {
        id: 'IsReverseBookWheeFliplDirection',
        control: 'switch',
        labelI18nKey: 'wheelDirection',
        tipI18nKey: 'wheelDirectionTip',
        modeScope: 'book-only',
        showInTopBar: true,
        showInDialog: true,
        dialogCategory: 'book',
    },
    {
        id: 'wheelSensitivity',
        control: 'num',
        labelI18nKey: 'wheelSensitivity',
        tipI18nKey: 'wheelSensitivityTip',
        modeScope: 'book-only',
        showInTopBar: true,
        showInDialog: true,
        dialogCategory: 'book',
        numKey: 'wheelSensitivity',
        min: 1,
        max: 250,
    },
]

export const settingFieldMap: Record<string, SettingFieldDefinition> = settingFieldDefinitions
    .reduce((map, item) => {
        map[item.id] = item
        return map
    }, {} as Record<string, SettingFieldDefinition>)

export const dialogSettingFieldIds: Record<SettingsPanelCategory, string[]> = {
    general: settingFieldDefinitions.filter(item => item.showInDialog && item.dialogCategory === 'general').map(item => item.id),
    scroll: settingFieldDefinitions.filter(item => item.showInDialog && item.dialogCategory === 'scroll').map(item => item.id),
    book: settingFieldDefinitions.filter(item => item.showInDialog && item.dialogCategory === 'book').map(item => item.id),
}

export const pinnedQuickSettingId = 'readingMode'
export const defaultQuickSettingOrder = quickSettingOptions.map(item => item.id)
export const defaultQuickSettingSelected = [
    'readingMode',
    'widthScale',
    'loadNum',
    'volumeSize',
    'showThumbView',
    'pagesPerScreen',
    'bookDirection',
    'isChangeOddEven',
    'showBookPagination',
    'showBookThumbView',
    'lang',
]
