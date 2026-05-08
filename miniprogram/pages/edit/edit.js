const { request, toast, requireAuth } = require('../../utils/api.js');

Page({
    data: {
        uuid: '',
        title: '添加资产',
        primaries: [],
        primaryIndex: -1,
        secondaries: [],
        secondaryIndex: -1,
        assetName: '',
        quantity: 1,
        expiryDate: ''
    },
    async onLoad(opts) {
        if (!requireAuth()) return;
        await this.loadCategories();
        if (opts && opts.uuid) {
            this.setData({ uuid: opts.uuid, title: '编辑资产' });
            wx.setNavigationBarTitle({ title: '编辑资产' });
            await this.loadOne(opts.uuid);
        }
    },
    async loadCategories() {
        try {
            const r = await request('/categories');
            this.cats = r.categories || [];
            this.setData({ primaries: this.cats.map(c => c.name) });
        } catch (e) { toast(e.message); }
    },
    async loadOne(uuid) {
        try {
            const r = await request('/assets');
            const item = (r.items || []).find(x => x.uuid === uuid);
            if (!item) return;
            const pi = this.cats.findIndex(c => c.name === item.primaryCategory);
            let secs = [], si = -1;
            if (pi >= 0) {
                secs = this.cats[pi].children || [];
                si = secs.indexOf(item.secondaryCategory);
            }
            this.setData({
                primaryIndex: pi,
                secondaries: secs,
                secondaryIndex: si,
                assetName: item.assetName,
                quantity: item.quantity,
                expiryDate: item.expiryDate ? String(item.expiryDate).slice(0, 10) : ''
            });
        } catch (e) { toast(e.message); }
    },
    onPrimary(e) {
        const i = Number(e.detail.value);
        const secs = (this.cats[i] && this.cats[i].children) || [];
        this.setData({ primaryIndex: i, secondaries: secs, secondaryIndex: secs.length ? 0 : -1 });
    },
    onSecondary(e) { this.setData({ secondaryIndex: Number(e.detail.value) }); },
    onName(e) { this.setData({ assetName: e.detail.value }); },
    onQty(e) { this.setData({ quantity: e.detail.value }); },
    onDate(e) { this.setData({ expiryDate: e.detail.value }); },

    async save() {
        const { uuid, primaries, primaryIndex, secondaries, secondaryIndex, assetName, quantity, expiryDate } = this.data;
        if (!assetName) return toast('资产名称必填');
        if (primaryIndex < 0) return toast('请选择一级分类');
        if (secondaryIndex < 0) return toast('请选择二级分类');

        const payload = {
            primaryCategory: primaries[primaryIndex],
            secondaryCategory: secondaries[secondaryIndex],
            assetName,
            quantity: Number(quantity) || 1,
            expiryDate
        };
        try {
            if (uuid) {
                await request('/assets/' + uuid, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, data: payload });
            } else {
                await request('/assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, data: payload });
            }
            toast('已保存', 'success');
            setTimeout(() => wx.navigateBack(), 600);
        } catch (e) { toast(e.message); }
    }
});
