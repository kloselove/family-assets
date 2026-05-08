const express = require('express');
const users = require('../lib/users');
const auth = require('../lib/auth');
const wechat = require('../lib/wechat');
const { asyncHandler, HttpError } = require('../lib/util');

const router = express.Router();

// 账号密码登录
router.post('/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) throw new HttpError(400, '用户名和密码必填');
    const user = users.findByUsername(username);
    if (!user || !users.verifyPassword(user, password)) {
        throw new HttpError(401, '用户名或密码错误');
    }
    users.updateLastLogin(user.id);
    res.json({
        token: auth.sign(user),
        user: { id: user.id, username: user.username, role: user.role }
    });
});

// 微信小程序登录（带首次绑定）
router.post('/wx-login', asyncHandler(async (req, res) => {
    const { code, username, password } = req.body || {};
    if (!code) throw new HttpError(400, '缺少 code');

    const { openid } = await wechat.code2Session(code);
    let user = users.findByOpenId(openid);

    if (!user && username && password) {
        const u = users.findByUsername(username);
        if (!u || !users.verifyPassword(u, password)) {
            throw new HttpError(401, '用户名或密码错误，无法绑定微信');
        }
        users.bindWxOpenId(u.id, openid);
        user = users.findById(u.id);
    }

    if (!user) {
        return res.status(428).json({
            error: '该微信尚未绑定账号，请使用账号密码完成首次绑定',
            needBind: true
        });
    }

    users.updateLastLogin(user.id);
    res.json({
        token: auth.sign(user),
        user: { id: user.id, username: user.username, role: user.role }
    });
}));

// 当前用户
router.get('/me', auth.authRequired, (req, res) => {
    res.json({ user: req.user });
});

// 修改密码
router.post('/change-password', auth.authRequired, (req, res) => {
    const { oldPassword, newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 6) throw new HttpError(400, '新密码至少 6 位');
    const u = users.findById(req.user.id);
    if (!u || !users.verifyPassword(u, oldPassword || '')) {
        throw new HttpError(401, '原密码错误');
    }
    users.changePassword(u.id, newPassword);
    res.json({ success: true });
});

module.exports = router;
