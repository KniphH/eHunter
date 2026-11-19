import { base } from './base'
import { reader } from './reader'
import { paging } from './paging'
import { loading } from './loading'
import { shell } from './shell'
import { settings } from './settings'
import { download } from './download'
import { superres } from './superres'
import { magnifier } from './magnifier'
import { stats } from './stats'

/**
 * 全部界面文案。按功能分文件，合并结果与拆分前的单文件版本逐键相同。
 */
const messages: Record<string, { cn: string, en: string, jp: string }> = {
    ...base,
    ...reader,
    ...paging,
    ...loading,
    ...shell,
    ...settings,
    ...download,
    ...superres,
    ...magnifier,
    ...stats,
}

export default messages
