const jwt = require('jsonwebtoken');
const users = require('./users');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function sign(user) {
    return jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

function verify(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (e) {
        return null;
    }
}

// 鉴权中间件
function authRequired(req, res, next) {
    const header = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token || '');
    if (!token) return res.status(401).json({ error: '未登录或令牌缺失' });
    const payload = verify(token);
    if (!payload) return res.status(401).json({ error: '令牌无效或已过期' });
    const user = users.findById(payload.id);
    if (!user) return res.status(401).json({ error: '用户不存在' });
    req.user = { id: user.id, username: user.username, role: user.role };
    next();
}

function adminOnly(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: '需要管理员权限' });
    }
    next();
}

module.exports = { sign, verify, authRequired, adminOnly };
