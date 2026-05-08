// app.js
App({
    globalData: {
        // ⚠️ 部署后请改成你的服务器地址（必须是 https，且在小程序后台配置 request 合法域名）
        apiBase: 'http://localhost:3000/api',
        token: '',
        user: null
    },
    onLaunch() {
        try {
            const t = wx.getStorageSync('fa_token');
            const u = wx.getStorageSync('fa_user');
            if (t && u) {
                this.globalData.token = t;
                this.globalData.user = u;
            }
        } catch (e) {}
    },
    saveAuth(token, user) {
        this.globalData.token = token;
        this.globalData.user = user;
        wx.setStorageSync('fa_token', token);
        wx.setStorageSync('fa_user', user);
    },
    clearAuth() {
        this.globalData.token = '';
        this.globalData.user = null;
        wx.removeStorageSync('fa_token');
        wx.removeStorageSync('fa_user');
    }
});
