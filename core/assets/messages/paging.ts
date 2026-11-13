/** 翻页方向、翻页动画、奇偶页与自动翻页 */
export const paging: Record<string, { cn: string, en: string, jp: string }> = {
    bookDirection: {
        cn: '阅读方向',
        en: 'Direction',
        jp: '読み取り方向'
    },
    bookDirectionTip: {
        cn: '阅读方向',
        en: 'Reading direction',
        jp: '読み取り方向'
    },
    rtl: {
        cn: 'RTL (从右到左)',
        en: 'RTL (Right To Left)',
        jp: 'RTL (右から左に)'
    },
    rtlAbbr: {
        cn: 'RTL',
        en: 'RTL',
        jp: 'RTL'
    },
    ltr: {
        cn: 'LTR (从左到右)',
        en: 'LTR (Left to Right)',
        jp: 'LTR (左から右へ)'
    },
    ltrAbbr: {
        cn: 'LTR',
        en: 'LTR',
        jp: 'LTR'
    },
    pagination: {
        cn: '页目录',
        en: 'Pagination',
        jp: 'ページネーション'
    },
    paginationTip: {
        cn: '显示/隐藏底部悬浮页目录',
        en: 'Show/hide the bottom floating pagination',
        jp: 'ボトムフローティングページネーションの表示/非表示'
    },
    bookAnimation: {
        cn: '换页动画',
        en: 'Sliding animation',
        jp: 'アニメーション'
    },
    bookAnimationTip: {
        cn: '开启/关闭换页时的滑动动画(测试中)',
        en: 'show/hide the sliding animation when changing location(Beta)',
        jp: '場所を変更するときのスライドアニメーションの表示/非表示(测试中)'
    },
    pageTurnAnimation: {
        cn: '翻页动效',
        en: 'Page turn animation',
        jp: 'ページめくり効果'
    },
    pageTurnAnimationTip: {
        cn: '设置书页模式翻页动效',
        en: 'Set page turn animation for book mode',
        jp: 'ページモードのアニメーションを設定'
    },
    pageTurnAnimationRealistic: {
        cn: '拟真翻页',
        en: 'Realistic',
        jp: 'リアル'
    },
    pageTurnAnimationSlide: {
        cn: '平移翻页',
        en: 'Slide',
        jp: 'スライド'
    },
    pageTurnAnimationNone: {
        cn: '无动效',
        en: 'None',
        jp: 'なし'
    },
    reverseFlip: {
        cn: '反转翻页',
        en: 'Reverse flip',
        jp: '反転フリップ'
    },
    reverseFlipTip: {
        cn: '反转翻页方向',
        en: 'Reverse page turning direction',
        jp: 'ページめくり方向を逆にする'
    },
    autoFlip: {
        cn: '自动翻页',
        en: 'Auto',
        jp: '自動ページめくり'
    },
    autoFlipTip: {
        cn: '自动翻页',
        en: 'Automatic page turning',
        jp: '自動ページめくり'
    },
    autoFlipFrequency: {
        cn: '翻页频率',
        en: 'Frequency',
        jp: '頻度'
    },
    autoFlipFrequencyTip: {
        cn: '自动翻页的频率',
        en: 'Automatic page turning frequency',
        jp: '自動ページめくり頻度'
    },
    oddEven: {
      cn: '奇偶切换',
      en: 'Odd/Even',
      jp: '奇/偶'
    },
    oddEvenTip: {
      cn: '切换奇偶页拼接',
      en: 'Switching odd or even page stitching',
      jp: '奇数または偶数ページステッチの切り替え' 
    },
}
