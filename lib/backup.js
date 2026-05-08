// 备份服务：手动 & 定时
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const store = require('./store');
const { writeCsvFile } = require('./util');

const BACKUP_KEEP = parseInt(process.env.BACKUP_KEEP || '30', 10);

async function backupData() {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(store.BACKUP_DIR, `assets-${ts}.csv`);
    const assets = await store.readAssets();
    await writeCsvFile(file, assets, store.ASSET_HEADER);
    console.log(`[Backup] 已生成: ${file}`);
    pruneOldBackups();
    return file;
}

function pruneOldBackups() {
    const list = fs.readdirSync(store.BACKUP_DIR)
        .filter(f => f.startsWith('assets-') && f.endsWith('.csv'))
        .sort()
        .reverse();
    if (list.length > BACKUP_KEEP) {
        list.slice(BACKUP_KEEP).forEach(f => {
            try { fs.unlinkSync(path.join(store.BACKUP_DIR, f)); } catch {}
        });
    }
}

function scheduleBackup(expr) {
    cron.schedule(expr, () => {
        console.log('[Cron] 触发定时备份...');
        backupData().catch(err => console.error('[Backup] 失败:', err));
    });
}

module.exports = { backupData, scheduleBackup };
