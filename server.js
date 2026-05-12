require('dotenv').config();

const express = require('express');
const cors = require('cors');

const users = require('./lib/users');
const store = require('./lib/store');
const { backupData, scheduleBackup } = require('./lib/backup');
const { errorHandler } = require('./lib/util');

const PORT = process.env.PORT || 3000;
const BACKUP_CRON = process.env.BACKUP_CRON || '0 2 * * *';
const BACKUP_KEEP = parseInt(process.env.BACKUP_KEEP || '30', 10);

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static('public', {
    etag: false,
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
    }
}));

// 初始化目录、文件、默认管理员
store.ensureInit();

const DEFAULT_ADMIN = process.env.ADMIN_DEFAULT_USERNAME || 'admin';
const DEFAULT_PASS = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123';
if (users.initDefaultAdmin(DEFAULT_ADMIN, DEFAULT_PASS)) {
    console.log(`[Init] 默认管理员已创建 -> ${DEFAULT_ADMIN} / ${DEFAULT_PASS}`);
    console.log('[Init] 请登录后尽快修改默认密码！');
}

// 健康检查（无需鉴权）
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
        version: require('./package.json').version
    });
});

// 业务路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/assets', require('./routes/assets'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api', require('./routes/maintenance')({ backupData }));

// MCP over HTTP（AI Agent 接入端点）
app.use('/mcp', require('./routes/mcp'));

// 统一错误处理（必须放在最后）
app.use(errorHandler);

// 定时备份
scheduleBackup(BACKUP_CRON);

app.listen(PORT, () => {
    console.log(`[Server] 已启动: http://localhost:${PORT}`);
    console.log(`[Server] MCP 端点: http://localhost:${PORT}/mcp`);
    console.log(`[Server] 定时备份: ${BACKUP_CRON}（保留 ${BACKUP_KEEP} 份）`);
});
