const express = require('express');
const { v4: uuidv4 } = require('uuid');
const auth = require('../lib/auth');
const store = require('../lib/store');
const { HttpError } = require('../lib/util');

const router = express.Router();
router.use(auth.authRequired);

router.get('/', (req, res) => {
    res.json(store.readCategories());
});

// 一级分类：增
router.post('/primary', (req, res) => {
    const { name } = req.body || {};
    if (!name) throw new HttpError(400, '分类名必填');
    const data = store.readCategories();
    if (data.categories.some(c => c.name === name)) throw new HttpError(400, '该一级分类已存在');
    data.categories.push({ id: uuidv4(), name, children: [] });
    store.writeCategories(data);
    res.json(data);
});

// 一级分类：改名
router.put('/primary/:name', (req, res) => {
    const { name: newName } = req.body || {};
    if (!newName) throw new HttpError(400, '新名称必填');
    const data = store.readCategories();
    const c = data.categories.find(x => x.name === req.params.name);
    if (!c) throw new HttpError(404, '不存在');
    c.name = newName;
    store.writeCategories(data);
    res.json(data);
});

// 一级分类：删
router.delete('/primary/:name', (req, res) => {
    const data = store.readCategories();
    data.categories = data.categories.filter(c => c.name !== req.params.name);
    store.writeCategories(data);
    res.json(data);
});

// 二级分类：增
router.post('/secondary', (req, res) => {
    const { primaryName, secondaryName } = req.body || {};
    if (!primaryName || !secondaryName) throw new HttpError(400, '必填');
    const data = store.readCategories();
    const p = data.categories.find(c => c.name === primaryName);
    if (!p) throw new HttpError(404, '一级分类不存在');
    if (p.children.includes(secondaryName)) throw new HttpError(400, '二级分类已存在');
    p.children.push(secondaryName);
    store.writeCategories(data);
    res.json(data);
});

// 二级分类：改名
router.put('/secondary', (req, res) => {
    const { primaryName, oldName, newName } = req.body || {};
    const data = store.readCategories();
    const p = data.categories.find(c => c.name === primaryName);
    if (!p) throw new HttpError(404, '一级分类不存在');
    const i = p.children.indexOf(oldName);
    if (i === -1) throw new HttpError(404, '二级分类不存在');
    p.children[i] = newName;
    store.writeCategories(data);
    res.json(data);
});

// 二级分类：删
router.delete('/secondary', (req, res) => {
    const { primaryName, secondaryName } = req.body || {};
    const data = store.readCategories();
    const p = data.categories.find(c => c.name === primaryName);
    if (p) p.children = p.children.filter(x => x !== secondaryName);
    store.writeCategories(data);
    res.json(data);
});

module.exports = router;
