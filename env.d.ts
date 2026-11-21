/// <reference types="vite/client" />

/** 由 vite 的 define 在构建时替换成 package.json 的 version */
declare const __EHUNTER_VERSION__: string | undefined

/** 构建时间戳，用来在设置里确认装的是哪一版 */
declare const __BUILD_STAMP__: string | undefined
