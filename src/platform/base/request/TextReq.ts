// a good resolution for poor network
import PlatformService from '../service/PlatformService'

export class TextReq {
    private url: string;
    private method = 'GET';
    private credentials = 'include';
    private retryTimes = 3;
    private timeoutTime = 5; // secs，固定值，不随重试次数累加
    private curRetryTimes = 0;
    private retryInterval = 1; // secs：失败后等 1 秒就重试，不用用户手动点
    private enabledLog = true;
    private fetchSetting = null;
    private noCache = false;
    private rejectError = true;

    constructor(url: string, noCache = false, rejectError = true) {
        this.url = url;
        this.noCache = noCache;
        this.rejectError = rejectError;
    }

    setMethod(method) {
        this.method = method;
        return this;
    }

    setCredentials(credential: string) {
        this.credentials = credential;
        return this;
    }

    setFetchSetting(setting: any) {
        this.fetchSetting = setting;
        return this;
    }

    setRetryTimes(times: number) {
        this.retryTimes = times;
    }

    setRetryInterval(secs: number) {
        this.retryInterval = secs;
    }

    setTimeOutTime(secs: number) {
        this.timeoutTime = secs;
    }

    request(): Promise<string> {
        return new Promise((resolve, reject) => {
            this._request(res => {
                res.text().then(text => resolve(text));
            }, err => {
                if (this.rejectError) {
                    reject(err);
                } else {
                    console.error(err);
                }
            });
        });
    }

    private printErrorLog(err) {
        console.error(`TextReq: request error in ${this.url}, retry:(${this.curRetryTimes}/${this.retryTimes}), error: ${err}`);
    }

    _request(successCallback, failureCallback) {
        this.curRetryTimes++;
        let url = this.url.includes('http') ? this.url : `${window.location.protocol}//${window.location.host}${this.url}`;
        if (this.noCache) {
            url = `${url}?_t=${new Date().getTime()}`;
        }
        let timeout = new Promise((resolve, reject) => {
            // 超时保持固定：原来会乘以重试次数（15/30/45 秒），一次失败能拖一分半
            setTimeout(reject, this.timeoutTime * 1000, 'request timed out');
        });
        let req = PlatformService.fetch(url, this.fetchSetting ? this.fetchSetting : {
            method: this.method,
            credentials: this.credentials
        });
        Promise
            .race([timeout, req])
            .then(async res => {
                if (res.status === 200) {
                    successCallback(res);
                    return;
                }
                /**
                 * 403 就按普通请求失败处理：重试、最后报错。
                 *
                 * 不再尝试区分「Cloudflare 挑战」并弹验证层——页面正常的时候
                 * （插件能解析、能显示内容）导航本身是通的，403 只是子请求被挑战，
                 * 这种情形弹验证既没有用、还会因为判断不准反复误报。
                 * 页面整个是验证页的那种情况，main.ts 在挂载前就识别并跳过了，
                 * 用户直接在页面上点验证框即可。
                 */
                throw new Error(`${url}: ${res.status}`);
            })
            .catch(err => {
                this.printErrorLog(err);
                if (this.curRetryTimes < this.retryTimes) {
                    setTimeout(() => {
                        this._request(successCallback, failureCallback);
                    }, this.retryInterval * 1000);
                } else {
                    failureCallback(err);
                }
            });
    }
}