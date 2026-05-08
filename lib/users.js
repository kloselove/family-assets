const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_JSON = path.join(DATA_DIR, 'users.json');

function ensureFile() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(USERS_JSON)) {
        fs.writeFileSync(USERS_JSON, JSON.stringify({ users: [] }, null, 2));
    }
}

function readUsers() {
    ensureFile();
    try {
        return JSON.parse(fs.readFileSync(USERS_JSON, 'utf8'));
    } catch (e) {
        return { users: [] };
    }
}

function writeUsers(data) {
    ensureFile();
    fs.writeFileSync(USERS_JSON, JSON.stringify(data, null, 2));
}

// 初始化默认管理员
function initDefaultAdmin(username, password) {
    const data = readUsers();
    if (data.users.length > 0) return null;
    const hash = bcrypt.hashSync(password, 10);
    const user = {
        id: uuidv4(),
        username,
        passwordHash: hash,
        role: 'admin',
        wxOpenId: '',
        createdAt: new Date().toISOString(),
        lastLoginAt: ''
    };
    data.users.push(user);
    writeUsers(data);
    return user;
}

function findByUsername(username) {
    return readUsers().users.find(u => u.username === username) || null;
}

function findById(id) {
    return readUsers().users.find(u => u.id === id) || null;
}

function findByOpenId(openid) {
    return readUsers().users.find(u => u.wxOpenId === openid) || null;
}

function verifyPassword(user, password) {
    if (!user || !user.passwordHash) return false;
    return bcrypt.compareSync(password, user.passwordHash);
}

function updateLastLogin(id) {
    const data = readUsers();
    const idx = data.users.findIndex(u => u.id === id);
    if (idx !== -1) {
        data.users[idx].lastLoginAt = new Date().toISOString();
        writeUsers(data);
    }
}

function bindWxOpenId(userId, openid) {
    const data = readUsers();
    const idx = data.users.findIndex(u => u.id === userId);
    if (idx === -1) return false;
    data.users[idx].wxOpenId = openid;
    writeUsers(data);
    return true;
}

function createUser({ username, password, role = 'member' }) {
    const data = readUsers();
    if (data.users.find(u => u.username === username)) {
        throw new Error('用户名已存在');
    }
    const user = {
        id: uuidv4(),
        username,
        passwordHash: bcrypt.hashSync(password, 10),
        role,
        wxOpenId: '',
        createdAt: new Date().toISOString(),
        lastLoginAt: ''
    };
    data.users.push(user);
    writeUsers(data);
    return user;
}

function changePassword(userId, newPassword) {
    const data = readUsers();
    const idx = data.users.findIndex(u => u.id === userId);
    if (idx === -1) return false;
    data.users[idx].passwordHash = bcrypt.hashSync(newPassword, 10);
    writeUsers(data);
    return true;
}

function listUsers() {
    return readUsers().users.map(u => ({
        id: u.id,
        username: u.username,
        role: u.role,
        wxBound: !!u.wxOpenId,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt
    }));
}

function deleteUser(id) {
    const data = readUsers();
    const before = data.users.length;
    data.users = data.users.filter(u => u.id !== id);
    writeUsers(data);
    return data.users.length < before;
}

module.exports = {
    initDefaultAdmin,
    findByUsername,
    findById,
    findByOpenId,
    verifyPassword,
    updateLastLogin,
    bindWxOpenId,
    createUser,
    changePassword,
    listUsers,
    deleteUser
};
