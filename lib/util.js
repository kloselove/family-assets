// 公共工具：异步路由包装、统一错误处理、CSV 写入
const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

/**
 * 把 async 路由包成普通中间件，自动 catch 异常 → next(err)
 * 用法：app.get('/x', asyncHandler(async (req, res) => { ... }))
 */
function asyncHandler(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/**
 * 标准错误响应：抛出 HttpError 即可被 errorHandler 捕获并转为 JSON
 */
class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

/**
 * 兜底错误处理中间件：统一返回 { error: '...' }
 */
function errorHandler(err, req, res, _next) {
    const status = err.status || 500;
    if (status >= 500) console.error('[Error]', err);
    res.status(status).json({ error: err.message || '内部错误' });
}

/**
 * 写 CSV 文件（统一使用项目 ASSET_HEADER）
 */
async function writeCsvFile(filePath, rows, header) {
    const w = createCsvWriter({ path: filePath, header });
    await w.writeRecords(rows);
}

/**
 * 确保目录存在
 */
function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

module.exports = { asyncHandler, HttpError, errorHandler, writeCsvFile, ensureDir };
