const axios = require('axios');

// 微信小程序 code2Session
// 文档: https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/login/auth.code2Session.html
async function code2Session(code) {
    const appid = process.env.WX_APPID;
    const secret = process.env.WX_SECRET;
    if (!appid || !secret || appid === 'your_wx_appid') {
        throw new Error('未配置 WX_APPID / WX_SECRET');
    }
    const url = 'https://api.weixin.qq.com/sns/jscode2session';
    const resp = await axios.get(url, {
        params: {
            appid,
            secret,
            js_code: code,
            grant_type: 'authorization_code'
        },
        timeout: 8000
    });
    const data = resp.data || {};
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
