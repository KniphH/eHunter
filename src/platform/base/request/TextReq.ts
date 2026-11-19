// a good resolution for poor network
import PlatformService from '../service/PlatformService'
import { notifyCloudflareChallenge } from '../../../../core/store/challenge'

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
                 * 403 有可能是 Cloudflare 挑战。交给 notifyCloudflareChallenge 判断：
                 * 它会先实测一次目标地址，只有确认仍是挑战页才弹出验证标签，
                 * 否则当作普通请求失败，继续走重试。
                 */
                if (res.status === 403) {
                    void notifyCloudflareChallenge(url);
                }
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