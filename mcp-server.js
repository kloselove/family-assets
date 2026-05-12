#!/usr/bin/env node
/**
 * 家庭资产管理 MCP Server（stdio 传输模式）
 * 用于 SSH 转发或本地 AI 客户端接入
 */
const readline = require('readline');
const store = require('./lib/mcp-store');
const { handleMessage } = require('./lib/mcp-core');

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', async (line) => {
    if (!line.trim()) return;
    try {
        const msg = JSON.parse(line);
        const resp = await handleMessage(msg, store);
        if (resp) process.stdout.write(JSON.stringify(resp) + '\n');
    } catch (e) {
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: ' + e.message } }) + '\n');
    }
});

rl.on('close', () => process.exit(0));
process.stderr.write('[MCP-stdio] family-assets server started\n');
