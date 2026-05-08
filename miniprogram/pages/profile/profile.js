const app = getApp();
const { request, toast } = require('../../utils/api.js');

Page({
    data: { user: null },
    onShow() {
        if (!app.globalData.token) { wx.reLaunch({ url: '/pages/login/login' }); return; }
        this.setData({ user: app.globalData.user });
    },
    changePwd() {
        wx.showModal({
            title: '原密码', editable: true, placeholderText: '请输入原密码',
            success: (r1) => {
                if (!r1.confirm) return;
                const oldPassword = r1.content;
                wx.showModal({
                    title: '新密码', editable: true, placeholderText: '至少 6 位',
                    success: async (r2) => {
                        if (!r2.confirm) return;
                        try {
                            await request('/auth/change-password', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                data: { oldPassword, newPassword: r2.content }
                            });
                            toast('已修改', 'success');
                        } catch (e) { toast(e.message); }
                    }
                });
            }
        });
    },
    bindWx() {
        wx.login({
            success: async (res) => {
                if (!res.code) return toast('授权失败');
                try {
                    // 已登录用户调用绑定：服务端会通过 Authorization 找到用户，但当前 wx-login 接口接受
                    // username/password 绑定。简化：让用户重输密码完成绑定。
                    wx.showModal({
                        title: '验证账号密码', content: '为安全起见，绑定微信需再次输入账号密码',
                        editable: true, placeholderText: '输入密码',
                        success: async (r) => {
                            if (!r.confirm) return;
                            try {
                                const ret = await request('/auth/wx-login', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    data: { code: res.code, username: app.globalData.user.username, password: r.content }
                                });
                                app.saveAuth(ret.token, ret.user);
                                toast('已绑定微信', 'success');
                            } catch (e) { toast(e.message); }
                        }
                    });
                } catch (e) { toast(e.message); }
            }
        });
    },
    logout() {
        wx.showModal({
            title: '退出登录', content: '确认退出？',
            success: (r) => {
                if (!r.confirm) return;
                app.clearAuth();
                wx.reLaunch({ url: '/pages/login/login' });
            }
        });
    }
});
