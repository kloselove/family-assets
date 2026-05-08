// utils/api.js
const app = getApp();

function request(path, options = {}) {
    return new Promise((resolve, reject) => {
        const headers = options.headers || {};
        if (app.globalData.token) headers['Authorization'] = 'Bearer ' + app.globalData.token;

        wx.request({
            url: app.globalData.apiBase + path,
            method: options.method || 'GET',
            data: options.data,
            header: headers,
            timeout: 15000,
            success: (res) => {
                if (res.statusCode === 401) {
                    app.clearAuth();
                    wx.reLaunch({ url: '/pages/login/login' });
                    reject(new Error('登录已过期'));
                    return;
                }
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(res.data);
                } else {
                    reject(new Error((res.data && res.data.error) || '请求失败'));
                }
            },
            fail: (err) => reject(err)
        });
    });
}

function toast(title, icon = 'none') {
    wx.showToast({ title, icon, duration: 1800 });
}

function requireAuth(page) {
    if (!app.globalData.token) {
        wx.reLaunch({ url: '/pages/login/login' });
        return false;
    }
    return true;
}

module.exports = { request, toast, requireAuth };
