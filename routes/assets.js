const express = require('express');
const { v4: uuidv4 } = require('uuid');
const auth = require('../lib/auth');
const store = require('../lib/store');
const { asyncHandler, HttpError } = require('../lib/util');

const router = express.Router();
router.use(auth.authRequired);

const DAY_MS = 86400000;

/** 资产列表（支持过滤） */
router.get('/', asyncHandler(async (req, res) => {
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
        const limit = now + days * DAY_MS;
        list = list.filter(a => {
            if (!a.expiryDate) return false;
            const t = new Date(a.expiryDate).getTime();
            return !isNaN(t) && t >= now && t <= limit;
        });
    }
    res.json({ total: list.length, items: list });
}));

/** 新增 */
router.post('/', asyncHandler(async (req, res) => {
    const { primaryCategory, secondaryCategory, assetName, quantity, expiryDate } = req.body || {};
    if (!assetName) throw new HttpError(400, '资产名称必填');

    const now = new Date().toISOString();
    const item = {
        uuid: uuidv4(),
        primaryCategory: primaryCategory || '',
        secondaryCategory: secondaryCategory || '',
        assetName,
        quantity: Number(quantity) || 1,
        createdAt: now,
        expiryDate: expiryDate || '',
        updatedAt: now,
        updatedBy: req.user.username
    };
    const assets = await store.readAssets();
    assets.push(item);
    await store.writeAssets(assets);
    res.json(item);
}));

/** 修改 */
router.put('/:uuid', asyncHandler(async (req, res) => {
    const assets = await store.readAssets();
    const idx = assets.findIndex(a => a.uuid === req.params.uuid);
    if (idx === -1) throw new HttpError(404, '资产不存在');

    // 只允许更新这些业务字段
    const fields = ['primaryCategory', 'secondaryCategory', 'assetName', 'quantity', 'expiryDate'];
    const patch = {};
    fields.forEach(f => {
        if (req.body[f] !== undefined) patch[f] = req.body[f];
    });
    if (patch.quantity !== undefined) patch.quantity = Number(patch.quantity) || 1;

    assets[idx] = {
        ...assets[idx],
        ...patch,
        updatedAt: new Date().toISOString(),
        updatedBy: req.user.username
    };
    await store.writeAssets(assets);
    res.json(assets[idx]);
}));

/** 删除 */
router.delete('/:uuid', asyncHandler(async (req, res) => {
    const assets = await store.readAssets();
    const before = assets.length;
    const next = assets.filter(a => a.uuid !== req.params.uuid);
    if (next.length === before) throw new HttpError(404, '资产不存在');
    await store.writeAssets(next);
    res.json({ success: true });
}));

module.exports = router;
