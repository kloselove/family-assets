const express = require('express');
const users = require('../lib/users');
const auth = require('../lib/auth');
const { HttpError } = require('../lib/util');

const router = express.Router();

// 所有用户管理接口需管理员
router.use(auth.authRequired, auth.adminOnly);

router.get('/', (req, res) => {
    res.json({ users: users.listUsers() });
});

router.post('/', (req, res) => {
    const { username, password, role } = req.body || {};
    if (!username || !password) throw new HttpError(400, '用户名密码必填');
    const u = users.createUser({ username, password, role: role || 'member' });
    res.json({ id: u.id, username: u.username, role: u.role });
});

router.delete('/:id', (req, res) => {
    if (req.params.id === req.user.id) throw new HttpError(400, '不能删除自己');
    res.json({ success: users.deleteUser(req.params.id) });
});

module.exports = router;
