/**
 * MCP 核心逻辑：Tools 定义 + Handler + 消息处理
 * 被 mcp-server.js（stdio）和 routes/mcp.js（HTTP）共用
 */
const { v4: uuidv4 } = require('uuid');

const SERVER_INFO = { name: 'family-assets', version: '1.0.0' };
const DAY_MS = 86400000;

const TOOLS = [
    {
        name: 'list_assets',
        description: '查询家庭资产列表，支持关键词搜索、按分类过滤、按过期天数过滤',
        inputSchema: {
            type: 'object',
            properties: {
                keyword: { type: 'string', description: '搜索关键词（匹配资产名、分类名）' },
                primaryCategory: { type: 'string', description: '按一级分类过滤' },
                secondaryCategory: { type: 'string', description: '按二级分类过滤' },
                expiringDays: { type: 'number', description: '筛选 N 天内将过期的资产' }
            }
        }
    },
    {
        name: 'add_asset',
        description: '新增一条家庭资产记录',
        inputSchema: {
            type: 'object',
            properties: {
                primaryCategory: { type: 'string', description: '一级分类' },
                secondaryCategory: { type: 'string', description: '二级分类' },
                assetName: { type: 'string', description: '资产名称' },
                quantity: { type: 'number', description: '数量，默认 1' },
                expiryDate: { type: 'string', description: '过期时间 YYYY-MM-DD（可选）' }
            },
            required: ['assetName']
        }
    },
    {
        name: 'update_asset',
        description: '修改一条家庭资产记录（通过 uuid 定位）',
        inputSchema: {
            type: 'object',
            properties: {
                uuid: { type: 'string', description: '资产 UUID' },
                primaryCategory: { type: 'string', description: '一级分类' },
                secondaryCategory: { type: 'string', description: '二级分类' },
                assetName: { type: 'string', description: '资产名称' },
                quantity: { type: 'number', description: '数量' },
                expiryDate: { type: 'string', description: '过期时间 YYYY-MM-DD' }
            },
            required: ['uuid']
        }
    },
    {
        name: 'delete_asset',
        description: '删除一条家庭资产记录',
        inputSchema: {
            type: 'object',
            properties: {
                uuid: { type: 'string', description: '要删除的资产 UUID' }
            },
            required: ['uuid']
        }
    },
    {
        name: 'get_stats',
        description: '获取家庭资产统计：总数、7天内过期、30天内过期、已过期、按分类汇总',
        inputSchema: { type: 'object', properties: {} }
    },
    {
        name: 'list_categories',
        description: '列出所有资产分类（一级 + 二级）',
        inputSchema: { type: 'object', properties: {} }
    },
    {
        name: 'add_category',
        description: '新增分类（一级或二级）',
        inputSchema: {
            type: 'object',
            properties: {
                primaryName: { type: 'string', description: '一级分类名称（新增一级时填此字段）' },
                secondaryName: { type: 'string', description: '二级分类名称（新增二级时需同时指定 primaryName）' }
            },
            required: ['primaryName']
        }
    },
    {
        name: 'rename_category',
        description: '重命名分类（会同步更新所有关联资产）',
        inputSchema: {
            type: 'object',
            properties: {
                level: { type: 'string', enum: ['primary', 'secondary'], description: '分类级别' },
                primaryName: { type: 'string', description: '一级分类名称（修改二级时指定所属一级）' },
                oldName: { type: 'string', description: '旧名称' },
                newName: { type: 'string', description: '新名称' }
            },
            required: ['level', 'oldName', 'newName']
        }
    },
    {
        name: 'delete_category',
        description: '删除分类',
        inputSchema: {
            type: 'object',
            properties: {
                level: { type: 'string', enum: ['primary', 'secondary'], description: '分类级别' },
                primaryName: { type: 'string', description: '一级分类名称' },
                secondaryName: { type: 'string', description: '二级分类名称（删除二级时填）' }
            },
            required: ['level', 'primaryName']
        }
    }
];

async function handleTool(name, args, store) {
    switch (name) {
        case 'list_assets': {
            let items = await store.readAssets();
            const { keyword, primaryCategory, secondaryCategory, expiringDays } = args || {};
            if (primaryCategory) items = items.filter(a => a.primaryCategory === primaryCategory);
            if (secondaryCategory) items = items.filter(a => a.secondaryCategory === secondaryCategory);
            if (keyword) {
                const kw = keyword.toLowerCase();
                items = items.filter(a =>
                    (a.assetName || '').toLowerCase().includes(kw) ||
                    (a.primaryCategory || '').toLowerCase().includes(kw) ||
                    (a.secondaryCategory || '').toLowerCase().includes(kw)
                );
            }
            if (expiringDays) {
                const now = Date.now(), limit = now + expiringDays * DAY_MS;
                items = items.filter(a => {
                    if (!a.expiryDate) return false;
                    const t = new Date(a.expiryDate).getTime();
                    return !isNaN(t) && t >= now && t <= limit;
                });
            }
            return { total: items.length, items };
        }
        case 'add_asset': {
            if (!args.assetName) throw new Error('assetName 必填');
            const assets = await store.readAssets();
            const now = new Date().toISOString();
            const item = {
                uuid: uuidv4(),
                primaryCategory: args.primaryCategory || '',
                secondaryCategory: args.secondaryCategory || '',
                assetName: args.assetName,
                quantity: Number(args.quantity) || 1,
                createdAt: now,
                expiryDate: args.expiryDate || '',
                updatedAt: now,
                updatedBy: 'mcp-agent'
            };
            assets.push(item);
            await store.writeAssets(assets);
            return { success: true, asset: item };
        }
        case 'update_asset': {
            if (!args.uuid) throw new Error('uuid 必填');
            const assets = await store.readAssets();
            const idx = assets.findIndex(a => a.uuid === args.uuid);
            if (idx === -1) throw new Error('资产不存在: ' + args.uuid);
            const fields = ['primaryCategory', 'secondaryCategory', 'assetName', 'quantity', 'expiryDate'];
            for (const f of fields) {
                if (args[f] !== undefined) assets[idx][f] = f === 'quantity' ? Number(args[f]) || 1 : args[f];
            }
            assets[idx].updatedAt = new Date().toISOString();
            assets[idx].updatedBy = 'mcp-agent';
            await store.writeAssets(assets);
            return { success: true, asset: assets[idx] };
        }
        case 'delete_asset': {
            if (!args.uuid) throw new Error('uuid 必填');
            const assets = await store.readAssets();
            const next = assets.filter(a => a.uuid !== args.uuid);
            if (next.length === assets.length) throw new Error('资产不存在: ' + args.uuid);
            await store.writeAssets(next);
            return { success: true, deleted: args.uuid };
        }
        case 'get_stats': {
            const assets = await store.readAssets();
            const now = Date.now();
            const in7 = now + 7 * DAY_MS, in30 = now + 30 * DAY_MS;
            const byPrimary = {};
            let expired = 0, expiring7 = 0, expiring30 = 0;
            for (const a of assets) {
                byPrimary[a.primaryCategory || '未分类'] = (byPrimary[a.primaryCategory || '未分类'] || 0) + 1;
                if (!a.expiryDate) continue;
                const t = new Date(a.expiryDate).getTime();
                if (isNaN(t)) continue;
                if (t < now) expired++;
                else if (t <= in7) expiring7++;
                else if (t <= in30) expiring30++;
            }
            return { total: assets.length, expired, expiring7, expiring30: expiring7 + expiring30, byPrimary };
        }
        case 'list_categories':
            return store.readCategories();
        case 'add_category': {
            const data = store.readCategories();
            if (args.secondaryName) {
                const p = data.categories.find(c => c.name === args.primaryName);
                if (!p) throw new Error('一级分类不存在: ' + args.primaryName);
                if (p.children.includes(args.secondaryName)) throw new Error('二级分类已存在');
                p.children.push(args.secondaryName);
            } else {
                if (data.categories.some(c => c.name === args.primaryName)) throw new Error('一级分类已存在');
                data.categories.push({ id: uuidv4(), name: args.primaryName, children: [] });
            }
            store.writeCategories(data);
            return { success: true, categories: data };
        }
        case 'rename_category': {
            const { level, primaryName, oldName, newName } = args;
            const data = store.readCategories();
            const assets = await store.readAssets();
            let changed = 0;
            if (level === 'primary') {
                const c = data.categories.find(x => x.name === oldName);
                if (c) c.name = newName;
                for (const a of assets) { if (a.primaryCategory === oldName) { a.primaryCategory = newName; changed++; } }
            } else {
                const p = data.categories.find(c => c.name === primaryName);
                if (p) { const i = p.children.indexOf(oldName); if (i !== -1) p.children[i] = newName; else if (!p.children.includes(newName)) p.children.push(newName); }
                for (const a of assets) { if (a.primaryCategory === (primaryName || '') && a.secondaryCategory === oldName) { a.secondaryCategory = newName; changed++; } }
            }
            store.writeCategories(data);
            if (changed > 0) await store.writeAssets(assets);
            return { success: true, assetsUpdated: changed, categories: data };
        }
        case 'delete_category': {
            const data = store.readCategories();
            if (args.level === 'primary') data.categories = data.categories.filter(c => c.name !== args.primaryName);
            else { const p = data.categories.find(c => c.name === args.primaryName); if (p && args.secondaryName) p.children = p.children.filter(x => x !== args.secondaryName); }
            store.writeCategories(data);
            return { success: true, categories: data };
        }
        default:
            throw new Error('Unknown tool: ' + name);
    }
}

/**
 * 处理 MCP JSON-RPC 消息，返回响应对象（或 null 表示通知无需响应）
 */
async function handleMessage(msg, store) {
    const { id, method, params } = msg;
    switch (method) {
        case 'initialize':
            return { jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: SERVER_INFO } };
        case 'notifications/initialized':
            return null;
        case 'tools/list':
            return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
        case 'tools/call': {
            const { name, arguments: toolArgs } = params || {};
            try {
                const result = await handleTool(name, toolArgs || {}, store);
                return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } };
            } catch (e) {
                return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `错误: ${e.message}` }], isError: true } };
            }
        }
        case 'ping':
            return { jsonrpc: '2.0', id, result: {} };
        default:
            return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found: ' + method } };
    }
}

module.exports = { SERVER_INFO, TOOLS, handleTool, handleMessage };
