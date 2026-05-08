const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const DATA_DIR = path.join(__dirname, '..', 'data');
const ASSETS_CSV = path.join(DATA_DIR, 'assets.csv');
const CATEGORIES_JSON = path.join(DATA_DIR, 'categories.json');

const ASSET_HEADER = [
    { id: 'uuid', title: 'uuid' },
    { id: 'primaryCategory', title: '一级分类' },
    { id: 'secondaryCategory', title: '二级分类' },
    { id: 'assetName', title: '资产名称' },
    { id: 'quantity', title: '数量' },
    { id: 'createdAt', title: '录入时间' },
    { id: 'expiryDate', title: '过期时间' },
    { id: 'updatedAt', title: '最后更新时间' },
    { id: 'updatedBy', title: '最后更新用户' }
];

function ensureInit() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(ASSETS_CSV)) {
        const w = createCsvWriter({ path: ASSETS_CSV, header: ASSET_HEADER });
        return w.writeRecords([]);
    }
    return Promise.resolve();
}

function readAssets() {
    return new Promise((resolve, reject) => {
        const assets = [];
        if (!fs.existsSync(ASSETS_CSV)) return resolve([]);
        fs.createReadStream(ASSETS_CSV)
            .pipe(csv())
            .on('data', (row) => {
                // CSV 读回来的是中文表头键，转成英文字段
                assets.push({
                    uuid: row.uuid || '',
                    primaryCategory: row['一级分类'] || '',
                    secondaryCategory: row['二级分类'] || '',
                    assetName: row['资产名称'] || '',
                    quantity: row['数量'] || '',
                    createdAt: row['录入时间'] || '',
                    expiryDate: row['过期时间'] || '',
                    updatedAt: row['最后更新时间'] || '',
                    updatedBy: row['最后更新用户'] || ''
                });
            })
            .on('end', () => resolve(assets))
            .on('error', reject);
    });
}

function writeAssets(assets) {
    const w = createCsvWriter({ path: ASSETS_CSV, header: ASSET_HEADER });
    return w.writeRecords(assets);
}

function readCategories() {
    if (!fs.existsSync(CATEGORIES_JSON)) {
        const init = {
            categories: [
                { id: require('uuid').v4(), name: '电子产品', children: ['手机', '电脑', '平板'] },
                { id: require('uuid').v4(), name: '家具家电', children: ['沙发', '电视', '冰箱'] },
                { id: require('uuid').v4(), name: '证件票据', children: ['身份证', '护照', '合同'] }
            ]
        };
        fs.writeFileSync(CATEGORIES_JSON, JSON.stringify(init, null, 2));
        return init;
    }
    try {
        return JSON.parse(fs.readFileSync(CATEGORIES_JSON, 'utf8'));
    } catch (e) {
        return { categories: [] };
    }
}

function writeCategories(data) {
    fs.writeFileSync(CATEGORIES_JSON, JSON.stringify(data, null, 2));
}

module.exports = {
    DATA_DIR,
    ASSETS_CSV,
    CATEGORIES_JSON,
    ASSET_HEADER,
    ensureInit,
    readAssets,
    writeAssets,
    readCategories,
    writeCategories
};
