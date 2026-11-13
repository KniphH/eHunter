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
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: option.method,
                    url,
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
        } else { // the ENV is Chrome or Firefox
            return window.fetch(url, option);
        }
    }
};
