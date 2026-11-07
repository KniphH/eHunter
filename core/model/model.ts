export interface ImgPageInfo {
    id: number | string,
    index: number,
    pageUrl: string,
    src: string,
    /**
     * 超分后的替代图（blob URL）。`src` 始终保留原始地址，
     * 渲染时优先用 displaySrc，关掉超分只要清空它即可回退。
     */
    displaySrc?: string,
    heightOfWidth: number,
    thumbHeight?: number,
    thumbWidth?: number,
    thumbStyle?: string,
    preciseHeightOfWidth?: number
}

export enum ThumbMode {
    SPIRIT = 0,
    IMG
}

export interface ThumbInfo {
    id: string | number,
    src: string;
    mode: ThumbMode,
    offset?: number;
    style?: string;
    height?: number;
    width?: number;
}

export interface PreviewThumbnailStyle {
    'background-image': string;
    'background-position': string;
    'background-size': string;
}

export enum ImgSrcMode {
    Default = 0,
    Fast = 1,
    Origin = 2,
    ChangeSource = 3
}
