// a service for crossing platform
/* eslint-disable no-undef */
import {
    readScriptValue,
    writeScriptValue,
    removeScriptValue,
    clearScriptStorage,
} from '../../../../core/service/scriptStorage'

// hack for test
if (typeof chrome === 'undefined') {
    var chrome = { extension: null };
}

export default {
    storage: {
        get sync() {
            if (chrome && chrome.storage) {
                return chrome.storage.sync.QUOTA_BYTES ? chrome.storage.sync : chrome.storage.local;
            } else {
                return window.localStorage;
            }
        },
        local: window.localStorage
    },
    storageGet(key, defaultValue = null) {
        return readScriptValue(key, defaultValue);
    },
    storageSet(key, value) {
        return writeScriptValue(key, value);
    },
    storageRemove(key) {
        return removeScriptValue(key);
    },
    storageClear() {
        // 只清本脚本自己的键；原来直接 localStorage.clear() 会把站点数据一起清掉
        clearScriptStorage([]);
        return true;
    },
    getExtension() {
        return chrome.extension;
    },
    fetch(url, option) {
        /* eslint-disable camelcase */
        if (typeof GM_info !== 'undefined' && GM_info.version) { // the ENV is Tampermonkey
            const send = (headers) => new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: option.method || 'GET',
                    url,
                    // 显式带 cookie：部分站点的会话状态挂在 HttpOnly cookie 上
                    anonymous: false,
                    ...(headers && Object.keys(headers).length ? { headers } : {}),
                    onload: x => {
                        let responseText = x.responseText;
                        x.text = async function() {
                            return responseText;
                        }
                        resolve(x);
                    },
                    onerror: e => {
                        reject(`GM_xhr error, ${e.status}`);
                    }
                });
            });

            return send(option.headers).then(res => {
                if (res.status !== 403) {
                    return res;
                }
                /**
                 * 403 常见于 Cloudflare 的机器人校验：它对「非导航」请求（XHR/子资源）
                 * 会单独发挑战，即使页面本身已经通过。补上导航级请求头再试一次，
                 * 让它看起来和地址栏里那次打开一致。仍然失败就把 403 交回去。
                 */
                return send({
                    ...(option.headers || {}),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': navigator.language || 'zh-CN',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'same-origin',
                    'Upgrade-Insecure-Requests': '1',
                });
            });
        } else { // the ENV is Chrome or Firefox
            return window.fetch(url, option);
        }
    }
};
