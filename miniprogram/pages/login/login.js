const app = getApp();
const { request, toast } = require('../../utils/api.js');

Page({
    data: {
        username: '',
        password: '',
        loading: false,
        wxLoading: false
    },
    onShow() {
        if (app.globalData.token) {
            wx.switchTab({ url: '/pages/list/list' });
        }
    },
    onUser(e) { this.setData({ username: e.detail.value }); },
    onPwd(e) { this.setData({ password: e.detail.value }); },

    async loginByPwd() {
        const { username, password } = this.data;
        if (!username || !password) return toast('请输入账号密码');
        this.setData({ loading: true });
        try {
            const r = await request('/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                data: { username, password }
            });
            app.saveAuth(r.token, r.user);
            toast('登录成功', 'success');
            setTimeout(() => wx.switchTab({ url: '/pages/list/list' }), 600);
        } catch (e) {
            toast(e.message);
        } finally {
            this.setData({ loading: false });
        }
    },

    // 微信一键登录（需先在小程序后台配置 AppId 并在服务端配置 WX_APPID/WX_SECRET）
    loginByWx() {
        const { username, password } = this.data;
        this.setData({ wxLoading: true });
        wx.login({
            success: async (res) => {
                if (!res.code) { this.setData({ wxLoading: false }); return toast('微信登录失败'); }
                try {
                    const body = { code: res.code };
                    if (username && password) { body.username = username; body.password = password; }
                    const r = await request('/auth/wx-login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        data: body
                    });
                    app.saveAuth(r.token, r.user);
                    toast('登录成功', 'success');
                    setTimeout(() => wx.switchTab({ url: '/pages/list/list' }), 600);
                } catch (e) {
                    if (e.message && e.message.indexOf('绑定') >= 0) {
                        toast('请先填写账号密码完成绑定');
                    } else {
                        toast(e.message);
                    }
                } finally {
                    this.setData({ wxLoading: false });
                }
            },
            fail: () => { this.setData({ wxLoading: false }); toast('微信授权失败'); }
        });
    }
});
