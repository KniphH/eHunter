// a good resolution for poor network
import { isCloudflareChallengeHtml } from '../../cloudflare'
import { notifyCloudflareChallenge } from '../../../../core/store/challenge'
import PlatformService from '../service/PlatformService'

export class TextReq {
    private url: string;
    private method = 'GET';
    private credentials = 'include';
    private retryTimes = 3;
    private timeoutTime = 15; // secs
    private curRetryTimes = 0;
    private retryInterval = 3; // secs
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
            setTimeout(reject, this.timeoutTime * 1000 * this.curRetryTimes, 'request timed out');
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
                 * 403 可能是 Cloudflare 的挑战（看漫画途中图片页被要求验证），
                 * 也可能只是权限拒绝。读一下响应体区分：是挑战页就弹验证层，
                 * 否则按普通 403 处理。
                 */
                if (res.status === 403) {
                    try {
                        const body = typeof res.text === 'function' ? await res.text() : '';
                        if (isCloudflareChallengeHtml(body)) {
                            notifyCloudflareChallenge(url);
                        }
                    } catch {
                        // 响应体读不出来就退化成普通 403
                    }
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