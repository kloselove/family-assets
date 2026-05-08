const app = getApp();
const { request, toast, requireAuth } = require('../../utils/api.js');

Page({
    data: {
        keyword: '',
        primaryList: [{ name: '', label: '全部分类' }],
        primaryIndex: 0,
        items: [],
        stats: { total: 0, expired: 0, expiringSoon: 0 },
        loading: false
    },
    onShow() {
        if (!requireAuth()) return;
        this.loadCategories();
        this.loadAssets();
    },
    async loadCategories() {
        try {
            const r = await request('/categories');
            const list = [{ name: '', label: '全部分类' }].concat(
                (r.categories || []).map(c => ({ name: c.name, label: c.name }))
            );
            this.setData({ primaryList: list });
        } catch (e) {}
    },
    async loadAssets() {
        this.setData({ loading: true });
        try {
            const { keyword, primaryList, primaryIndex } = this.data;
            const params = [];
            if (keyword) params.push('keyword=' + encodeURIComponent(keyword));
            const cur = primaryList[primaryIndex];
            if (cur && cur.name) params.push('primary=' + encodeURIComponent(cur.name));
            const qs = params.length ? '?' + params.join('&') : '';
            const r = await request('/assets' + qs);
            const items = (r.items || []).map(this.decorate);
            this.setData({ items });

            const s = await request('/stats');
            this.setData({ stats: s });
        } catch (e) {
            toast(e.message);
        } finally {
            this.setData({ loading: false });
            wx.stopPullDownRefresh();
        }
    },
    decorate(a) {
        let tag = '';
        if (a.expiryDate) {
            const t = new Date(a.expiryDate).getTime();
            const now = Date.now();
            if (!isNaN(t)) {
                if (t < now) tag = 'expired';
                else if (t - now < 30 * 86400000) tag = 'soon';
            }
        }
        return Object.assign({}, a, { _tag: tag });
    },
    onPullDownRefresh() { this.loadAssets(); },
    onKw(e) { this.setData({ keyword: e.detail.value }); },
    onSearch() { this.loadAssets(); },
    onPrimaryChange(e) {
        this.setData({ primaryIndex: Number(e.detail.value) });
        this.loadAssets();
    },
    addAsset() { wx.navigateTo({ url: '/pages/edit/edit' }); },
    editAsset(e) {
        const uuid = e.currentTarget.dataset.uuid;
        wx.navigateTo({ url: '/pages/edit/edit?uuid=' + uuid });
    },
    async delAsset(e) {
        const uuid = e.currentTarget.dataset.uuid;
        const r = await wx.showModal({ title: '确认删除？', content: '该操作不可撤销' });
        if (!r.confirm) return;
        try {
            await request('/assets/' + uuid, { method: 'DELETE' });
            toast('已删除', 'success');
            this.loadAssets();
        } catch (err) { toast(err.message); }
    }
});
