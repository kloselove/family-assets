// 数据维护：统计、导入导出、备份
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
const { v4: uuidv4 } = require('uuid');

const auth = require('../lib/auth');
const store = require('../lib/store');
const { asyncHandler, HttpError, writeCsvFile } = require('../lib/util');

const DAY_MS = 86400000;

function buildRouter({ backupData }) {
    const router = express.Router();
    router.use(auth.authRequired);

    /** 统计 */
    router.get('/stats', asyncHandler(async (req, res) => {
        const assets = await store.readAssets();
        const now = Date.now();
        const in30 = now + 30 * DAY_MS;

        const byPrimary = {};
        let expired = 0, expiringSoon = 0;
        for (const a of assets) {
            const k = a.primaryCategory || '未分类';
            byPrimary[k] = (byPrimary[k] || 0) + 1;
            if (!a.expiryDate) continue;
            const t = new Date(a.expiryDate).getTime();
            if (isNaN(t)) continue;
            if (t < now) expired++;
            else if (t <= in30) expiringSoon++;
        }
        res.json({ total: assets.length, expired, expiringSoon, byPrimary });
    }));

    /** 导出 */
    router.get('/export', asyncHandler(async (req, res) => {
        const assets = await store.readAssets();
        if (!assets.length) throw new HttpError(400, '无数据可导出');
        const file = path.join(store.BACKUP_DIR, `export-${Date.now()}.csv`);
        await writeCsvFile(file, assets, store.ASSET_HEADER);
        res.download(file);
    }));

    /** 导入 */
    router.post('/import', multer().single('csvFile'), asyncHandler(async (req, res) => {
        if (!req.file) throw new HttpError(400, '未上传文件');
        const username = req.user.username;
        const rows = await parseCsvBuffer(req.file.buffer, username);
        const exists = await store.readAssets();
        await store.writeAssets([...exists, ...rows]);
        res.json({ success: true, count: rows.length });
    }));

    /** 立即备份（管理员） */
    router.post('/backup', auth.adminOnly, asyncHandler(async (req, res) => {
        const file = await backupData();
        res.json({ success: true, file: path.basename(file) });
    }));

    /** 备份列表（管理员） */
    router.get('/backups', auth.adminOnly, (req, res) => {
        const list = fs.readdirSync(store.BACKUP_DIR)
            .filter(f => f.endsWith('.csv'))
            .sort()
            .reverse();
        res.json({ items: list });
    });

    return router;
}

function parseCsvBuffer(buffer, username) {
    return new Promise((resolve, reject) => {
        const rows = [];
        Readable.from(buffer)
            .pipe(csv())
            .on('data', (d) => {
                rows.push({
                    uuid: d.uuid || uuidv4(),
                    primaryCategory: d['一级分类'] || d.primaryCategory || '',
                    secondaryCategory: d['二级分类'] || d.secondaryCategory || '',
                    assetName: d['资产名称'] || d.assetName || '',
                    quantity: Number(d['数量'] || d.quantity) || 1,
                    createdAt: d['录入时间'] || d.createdAt || new Date().toISOString(),
                    expiryDate: d['过期时间'] || d.expiryDate || '',
                    updatedAt: d['最后更新时间'] || d.updatedAt || new Date().toISOString(),
                    updatedBy: d['最后更新用户'] || d.updatedBy || username
                });
            })
            .on('end', () => resolve(rows))
            .on('error', reject);
    });
}

module.exports = buildRouter;
