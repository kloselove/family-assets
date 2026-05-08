require('dotenv').config();

const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const users = require('./lib/users');
const auth = require('./lib/auth');
const wechat = require('./lib/wechat');
const store = require('./lib/store');

const app = express();
const PORT = process.env.PORT || 3000;
const BACKUP_DIR = path.join(__dirname, 'backups');
const BACKUP_CRON = process.env.BACKUP_CRON || '0 2 * * *';
const BACKUP_KEEP = parseInt(process.env.BACKUP_KEEP || '30', 10);

// 中间件
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static('public'));

// 初始化目录与文件
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
store.ensureInit();

// 初始化默认管理员
const DEFAULT_ADMIN = process.env.ADMIN_DEFAULT_USERNAME || 'admin';
const DEFAULT_PASS = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123';
const created = users.initDefaultAdmin(DEFAULT_ADMIN, DEFAULT_PASS);
if (created) {
    console.log(`[Init] 默认管理员已创建 -> 用户名: ${DEFAULT_ADMIN}  密码: ${DEFAULT_PASS}`);
    console.log('[Init] 请登录后尽快修改默认密码！');
}

// ==================== 备份 ====================
async function backupData() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(BACKUP_DIR, `assets-${timestamp}.csv`);
    try {
        const assets = await store.readAssets();
        const w = createCsvWriter({ path: backupFile, header: store.ASSET_HEADER });
        await w.writeRecords(assets);
        console.log(`[Backup] 已生成: ${backupFile}`);

        // 保留最近 N 份
        const list = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('assets-') && f.endsWith('.csv'))
            .sort()
            .reverse();
        if (list.length > BACKUP_KEEP) {
            list.slice(BACKUP_KEEP).forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f)));
        }
        return backupFile;
    } catch (error) {
        console.error('[Backup] 失败:', error);
        throw error;
    }
}
cron.schedule(BACKUP_CRON, () => {
    console.log('[Cron] 触发定时备份...');
    backupData().catch(() => {});
});

// ==================== 健康检查（无需鉴权） ====================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
        version: require('./package.json').version
    });
});

// ==================== 登录 / 鉴权 ====================

// 用户名密码登录
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码必填' });
    }
    const user = users.findByUsername(username);
    if (!user || !users.verifyPassword(user, password)) {
        return res.status(401).json({ error: '用户名或密码错误' });
    }
    users.updateLastLogin(user.id);
    const token = auth.sign(user);
    res.json({
        token,
        user: { id: user.id, username: user.username, role: user.role }
    });
});

// 微信小程序登录：传入 wx.login 得到的 code
// 可选：username/password 做首次绑定
app.post('/api/auth/wx-login', async (req, res) => {
    try {
        const { code, username, password } = req.body || {};
        if (!code) return res.status(400).json({ error: '缺少 code' });

        const { openid } = await wechat.code2Session(code);

        // 已绑定：直接登录
        let user = users.findByOpenId(openid);

        // 未绑定：若提供了账号密码，则绑定
        if (!user && username && password) {
            const u = users.findByUsername(username);
            if (!u || !users.verifyPassword(u, password)) {
                return res.status(401).json({ error: '用户名或密码错误，无法绑定微信' });
            }
            users.bindWxOpenId(u.id, openid);
            user = users.findById(u.id);
        }

        if (!user) {
            // 微信身份未绑定且未传账号 → 提示前端切到账号绑定流程
            return res.status(428).json({
                error: '该微信尚未绑定账号，请使用账号密码完成首次绑定',
                needBind: true
            });
        }

        users.updateLastLogin(user.id);
        const token = auth.sign(user);
        res.json({
            token,
            user: { id: user.id, username: user.username, role: user.role }
        });
    } catch (e) {
        res.status(500).json({ error: e.message || '微信登录失败' });
    }
});

// 当前用户信息
app.get('/api/auth/me', auth.authRequired, (req, res) => {
    res.json({ user: req.user });
});

// 修改密码
app.post('/api/auth/change-password', auth.authRequired, (req, res) => {
    const { oldPassword, newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: '新密码至少 6 位' });
    }
    const u = users.findById(req.user.id);
    if (!u || !users.verifyPassword(u, oldPassword || '')) {
        return res.status(401).json({ error: '原密码错误' });
    }
    users.changePassword(u.id, newPassword);
    res.json({ success: true });
});

// ==================== 用户管理（仅管理员） ====================
app.get('/api/users', auth.authRequired, auth.adminOnly, (req, res) => {
    res.json({ users: users.listUsers() });
});

app.post('/api/users', auth.authRequired, auth.adminOnly, (req, res) => {
    try {
        const { username, password, role } = req.body || {};
        if (!username || !password) return res.status(400).json({ error: '用户名密码必填' });
        const u = users.createUser({ username, password, role: role || 'member' });
        res.json({ id: u.id, username: u.username, role: u.role });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.delete('/api/users/:id', auth.authRequired, auth.adminOnly, (req, res) => {
    if (req.params.id === req.user.id) {
        return res.status(400).json({ error: '不能删除自己' });
    }
    const ok = users.deleteUser(req.params.id);
    res.json({ success: ok });
});

// ==================== 资产 CRUD（登录后可访问） ====================

// 带查询条件的列表
app.get('/api/assets', auth.authRequired, async (req, res) => {
    try {
        const all = await store.readAssets();
        const { keyword, primary, secondary, expiringDays } = req.query;

        let list = all;
        if (primary) list = list.filter(a => a.primaryCategory === primary);
        if (secondary) list = list.filter(a => a.secondaryCategory === secondary);
        if (keyword) {
            const kw = String(keyword).toLowerCase();
            list = list.filter(a =>
                (a.assetName || '').toLowerCase().includes(kw) ||
                (a.primaryCategory || '').toLowerCase().includes(kw) ||
                (a.secondaryCategory || '').toLowerCase().includes(kw)
            );
        }
        if (expiringDays) {
            const days = parseInt(expiringDays, 10);
            const now = Date.now();
            const limit = now + days * 86400000;
            list = list.filter(a => {
                if (!a.expiryDate) return false;
                const t = new Date(a.expiryDate).getTime();
                return !isNaN(t) && t >= now && t <= limit;
            });
        }
        res.json({ total: list.length, items: list });
    } catch (e) {
        res.status(500).json({ error: '读取失败' });
    }
});

app.post('/api/assets', auth.authRequired, async (req, res) => {
    try {
        const assets = await store.readAssets();
        const now = new Date().toISOString();
        const item = {
            uuid: uuidv4(),
            primaryCategory: req.body.primaryCategory || '',
            secondaryCategory: req.body.secondaryCategory || '',
            assetName: req.body.assetName || '',
            quantity: req.body.quantity || 1,
            createdAt: now,
            expiryDate: req.body.expiryDate || '',
            updatedAt: now,
            updatedBy: req.user.username
        };
        if (!item.assetName) return res.status(400).json({ error: '资产名称必填' });
        assets.push(item);
        await store.writeAssets(assets);
        res.json(item);
    } catch (e) {
        res.status(500).json({ error: '添加失败' });
    }
});

app.put('/api/assets/:uuid', auth.authRequired, async (req, res) => {
    try {
        const assets = await store.readAssets();
        const idx = assets.findIndex(a => a.uuid === req.params.uuid);
        if (idx === -1) return res.status(404).json({ error: '资产不存在' });
        assets[idx] = {
            ...assets[idx],
            ...req.body,
            uuid: assets[idx].uuid,
            createdAt: assets[idx].createdAt,
            updatedAt: new Date().toISOString(),
            updatedBy: req.user.username
        };
        await store.writeAssets(assets);
        res.json(assets[idx]);
    } catch (e) {
        res.status(500).json({ error: '更新失败' });
    }
});

app.delete('/api/assets/:uuid', auth.authRequired, async (req, res) => {
    try {
        let assets = await store.readAssets();
        const before = assets.length;
        assets = assets.filter(a => a.uuid !== req.params.uuid);
        if (assets.length === before) return res.status(404).json({ error: '资产不存在' });
        await store.writeAssets(assets);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: '删除失败' });
    }
});

// ==================== 分类 ====================
app.get('/api/categories', auth.authRequired, (req, res) => {
    res.json(store.readCategories());
});

app.post('/api/categories/primary', auth.authRequired, (req, res) => {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: '分类名必填' });
    const data = store.readCategories();
    if (data.categories.find(c => c.name === name)) {
        return res.status(400).json({ error: '该一级分类已存在' });
    }
    data.categories.push({ id: uuidv4(), name, children: [] });
    store.writeCategories(data);
    res.json(data);
});

app.put('/api/categories/primary/:name', auth.authRequired, (req, res) => {
    const { name: newName } = req.body || {};
    if (!newName) return res.status(400).json({ error: '新名称必填' });
    const data = store.readCategories();
    const c = data.categories.find(x => x.name === req.params.name);
    if (!c) return res.status(404).json({ error: '不存在' });
    c.name = newName;
    store.writeCategories(data);
    res.json(data);
});

app.delete('/api/categories/primary/:name', auth.authRequired, (req, res) => {
    const data = store.readCategories();
    data.categories = data.categories.filter(c => c.name !== req.params.name);
    store.writeCategories(data);
    res.json(data);
});

app.post('/api/categories/secondary', auth.authRequired, (req, res) => {
    const { primaryName, secondaryName } = req.body || {};
    if (!primaryName || !secondaryName) return res.status(400).json({ error: '必填' });
    const data = store.readCategories();
    const p = data.categories.find(c => c.name === primaryName);
    if (!p) return res.status(404).json({ error: '一级分类不存在' });
    if (p.children.includes(secondaryName)) return res.status(400).json({ error: '二级分类已存在' });
    p.children.push(secondaryName);
    store.writeCategories(data);
    res.json(data);
});

app.put('/api/categories/secondary', auth.authRequired, (req, res) => {
    const { primaryName, oldName, newName } = req.body || {};
    const data = store.readCategories();
    const p = data.categories.find(c => c.name === primaryName);
    if (!p) return res.status(404).json({ error: '一级分类不存在' });
    const i = p.children.indexOf(oldName);
    if (i === -1) return res.status(404).json({ error: '二级分类不存在' });
    p.children[i] = newName;
    store.writeCategories(data);
    res.json(data);
});

app.delete('/api/categories/secondary', auth.authRequired, (req, res) => {
    const { primaryName, secondaryName } = req.body || {};
    const data = store.readCategories();
    const p = data.categories.find(c => c.name === primaryName);
    if (p) p.children = p.children.filter(x => x !== secondaryName);
    store.writeCategories(data);
    res.json(data);
});

// ==================== 数据维护：统计 & 过期提醒 ====================
app.get('/api/stats', auth.authRequired, async (req, res) => {
    try {
        const assets = await store.readAssets();
        const now = Date.now();
        const in30 = now + 30 * 86400000;

        const byPrimary = {};
        let expired = 0;
        let expiringSoon = 0;
        assets.forEach(a => {
            byPrimary[a.primaryCategory || '未分类'] =
                (byPrimary[a.primaryCategory || '未分类'] || 0) + 1;
            if (a.expiryDate) {
                const t = new Date(a.expiryDate).getTime();
                if (!isNaN(t)) {
                    if (t < now) expired++;
                    else if (t <= in30) expiringSoon++;
                }
            }
        });
        res.json({
            total: assets.length,
            expired,
            expiringSoon,
            byPrimary
        });
    } catch (e) {
        res.status(500).json({ error: '统计失败' });
    }
});

// ==================== 导入导出 & 备份 ====================
app.get('/api/export', auth.authRequired, async (req, res) => {
    try {
        const assets = await store.readAssets();
        if (!assets.length) return res.status(400).json({ error: '无数据可导出' });
        const file = path.join(BACKUP_DIR, `export-${Date.now()}.csv`);
        const w = createCsvWriter({ path: file, header: store.ASSET_HEADER });
        await w.writeRecords(assets);
        res.download(file);
    } catch (e) {
        res.status(500).json({ error: '导出失败' });
    }
});

app.post('/api/import', auth.authRequired, multer().single('csvFile'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: '未上传文件' });
    const rows = [];
    const { Readable } = require('stream');
    const stream = Readable.from(req.file.buffer);
    stream
        .pipe(csv())
        .on('data', (d) => {
            rows.push({
                uuid: d.uuid || uuidv4(),
                primaryCategory: d['一级分类'] || d.primaryCategory || '',
                secondaryCategory: d['二级分类'] || d.secondaryCategory || '',
                assetName: d['资产名称'] || d.assetName || '',
                quantity: d['数量'] || d.quantity || 1,
                createdAt: d['录入时间'] || d.createdAt || new Date().toISOString(),
                expiryDate: d['过期时间'] || d.expiryDate || '',
                updatedAt: d['最后更新时间'] || d.updatedAt || new Date().toISOString(),
                updatedBy: d['最后更新用户'] || d.updatedBy || req.user.username
            });
        })
        .on('end', async () => {
            try {
                const exists = await store.readAssets();
                await store.writeAssets([...exists, ...rows]);
                res.json({ success: true, count: rows.length });
            } catch (e) {
                res.status(500).json({ error: '导入失败' });
            }
        })
        .on('error', (err) => res.status(500).json({ error: err.message }));
});

app.post('/api/backup', auth.authRequired, auth.adminOnly, async (req, res) => {
    try {
        const file = await backupData();
        res.json({ success: true, file: path.basename(file) });
    } catch (e) {
        res.status(500).json({ error: '备份失败' });
    }
});

app.get('/api/backups', auth.authRequired, auth.adminOnly, (req, res) => {
    try {
        const list = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.endsWith('.csv'))
            .sort()
            .reverse();
        res.json({ items: list });
    } catch (e) {
        res.status(500).json({ error: '读取备份列表失败' });
    }
});

// ==================== 启动 ====================
app.listen(PORT, () => {
    console.log(`[Server] 已启动: http://localhost:${PORT}`);
    console.log(`[Server] 定时备份表达式: ${BACKUP_CRON}  保留: ${BACKUP_KEEP} 份`);
});
