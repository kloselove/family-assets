// 命令行创建用户脚本: node scripts/init-user.js <username> <password> [role]
require('dotenv').config();
const users = require('../lib/users');

const [, , username, password, role = 'member'] = process.argv;
if (!username || !password) {
    console.log('用法: node scripts/init-user.js <username> <password> [admin|member]');
    process.exit(1);
}
try {
    const u = users.createUser({ username, password, role });
    console.log('已创建用户:', { id: u.id, username: u.username, role: u.role });
} catch (e) {
    console.error('创建失败:', e.message);
    process.exit(1);
}
