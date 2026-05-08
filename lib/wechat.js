// 微信小程序 code2Session
// 文档: https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/login/auth.code2Session.html
//
// 用 Node 原生 https 模块实现，避免引入 axios 节省镜像体积。
const https = require('https');
const { URL } = require('url');

function httpGetJson(targetUrl, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
        const u = new URL(targetUrl);
        const req = https.get(u, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                try {
                    resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
                } catch (e) {
                    reject(new Error('微信返回不是合法 JSON'));
                }
            });
        });
        req.setTimeout(timeoutMs, () => req.destroy(new Error('微信接口超时')));
        req.on('error', reject);
    });
}

async function code2Session(code) {
    const appid = process.env.WX_APPID;
    const secret = process.env.WX_SECRET;
    if (!appid || !secret || appid === 'your_wx_appid') {
        throw new Error('未配置 WX_APPID / WX_SECRET');
    }
    const params = new URLSearchParams({
        appid, secret, js_code: code, grant_type: 'authorization_code'
    });
    const data = await httpGetJson('https://api.weixin.qq.com/sns/jscode2session?' + params.toString());
    if (data.errcode) {
        throw new Error(`微信登录失败: ${data.errcode} ${data.errmsg}`);
    }
    return {
        openid: data.openid,
        unionid: data.unionid || '',
        sessionKey: data.session_key
    };
}

module.exports = { code2Session };
