/**
 * MCP over HTTP（Streamable HTTP 传输）
 * 
 * 端点：POST /mcp  — 发送 JSON-RPC 请求
 *       GET  /mcp  — SSE 通道（可选，用于服务端推送通知）
 * 
 * 鉴权：通过 API Key 认证（Bearer Token 或 query 参数）
 *   Header:  Authorization: Bearer <MCP_API_KEY>
 *   或 URL:  /mcp?key=<MCP_API_KEY>
 * 
 * AI Agent 配置示例：
 *   { "url": "http://192.168.31.92:3000/mcp", "headers": { "Authorization": "Bearer your-api-key" } }
 */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const store = require('../lib/store');
const { handleMessage } = require('../lib/mcp-core');

const router = express.Router();

// ==================== API Key 鉴权 ====================
// 从 .env 的 MCP_API_KEY 读取，未配置则自动生成一个并打印到日志
let MCP_API_KEY = process.env.MCP_API_KEY || '';
if (!MCP_API_KEY) {
    MCP_API_KEY = uuidv4().replace(/-/g, '');
    console.log(`[MCP] 未配置 MCP_API_KEY，已自动生成: ${MCP_API_KEY}`);
    console.log('[MCP] 建议在 .env 中设置 MCP_API_KEY 固定密钥，避免重启后变更');
}

function checkApiKey(req, res, next) {
    const header = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.key || '');
    if (!token || token !== MCP_API_KEY) {
        return res.status(401).json({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32000, message: '未授权：缺少或无效的 MCP_API_KEY' }
        });
    }
    next();
}

// 所有 MCP 端点都需要 API Key
router.use(checkApiKey);

// 会话管理（轻量级，内存存储，容器重启后自动重新 initialize）
const sessions = new Map();
const SESSION_TTL = 30 * 60 * 1000; // 30 分钟过期

function cleanSessions() {
    const now = Date.now();
    for (const [id, s] of sessions) {
        if (now - s.lastAccess > SESSION_TTL) sessions.delete(id);
    }
}
setInterval(cleanSessions, 5 * 60 * 1000);

/**
 * POST /mcp — 处理 JSON-RPC 请求
 * 
 * 请求头：Content-Type: application/json
 * 可选头：Mcp-Session-Id: <id>（initialize 后返回的会话 ID）
 */
router.post('/', express.json(), async (req, res) => {
    const msg = req.body;
    if (!msg || !msg.jsonrpc) {
        return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON-RPC' } });
    }

    // MCP store adapter：HTTP 模式用主应用的 store（共享同一份数据文件）
    const mcpStore = {
        readAssets: store.readAssets,
        writeAssets: store.writeAssets,
        readCategories: store.readCategories,
        writeCategories: store.writeCategories
    };

    try {
        const resp = await handleMessage(msg, mcpStore);

        // initialize 请求：创建会话，返回 Session ID
        if (msg.method === 'initialize' && resp && resp.result) {
            const sessionId = uuidv4();
            sessions.set(sessionId, { createdAt: Date.now(), lastAccess: Date.now() });
            res.setHeader('Mcp-Session-Id', sessionId);
        }

        // 更新会话访问时间
        const sid = req.headers['mcp-session-id'];
        if (sid && sessions.has(sid)) {
            sessions.get(sid).lastAccess = Date.now();
        }

        if (resp === null) {
            // 通知消息（如 notifications/initialized）无响应体
            return res.status(204).end();
        }

        res.setHeader('Content-Type', 'application/json');
        res.json(resp);
    } catch (e) {
        res.status(500).json({
            jsonrpc: '2.0',
            id: msg.id || null,
            error: { code: -32603, message: e.message }
        });
    }
});

/**
 * GET /mcp — SSE 端点（可选，用于服务端推送）
 * 当前实现为简单保活，未来可扩展为异步通知通道
 */
router.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 发送欢迎事件
    res.write(`event: endpoint\ndata: /mcp\n\n`);

    // 心跳保活
    const heartbeat = setInterval(() => {
        res.write(`: heartbeat\n\n`);
    }, 15000);

    req.on('close', () => {
        clearInterval(heartbeat);
    });
});

/**
 * DELETE /mcp — 关闭会话
 */
router.delete('/', (req, res) => {
    const sid = req.headers['mcp-session-id'];
    if (sid) sessions.delete(sid);
    res.status(204).end();
});

module.exports = router;
