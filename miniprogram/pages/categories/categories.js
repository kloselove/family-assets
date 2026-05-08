const { request, toast, requireAuth } = require('../../utils/api.js');

Page({
    data: { categories: [] },
    onShow() { if (requireAuth()) this.load(); },
    async load() {
        try {
            const r = await request('/categories');
            this.setData({ categories: r.categories || [] });
        } catch (e) { toast(e.message); }
    },
    addPrimary() {
        wx.showModal({
            title: '新建一级分类', editable: true, placeholderText: '分类名',
            success: async (r) => {
                if (!r.confirm || !r.content) return;
                try { await request('/categories/primary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, data: { name: r.content } }); this.load(); }
                catch (e) { toast(e.message); }
            }
        });
    },
    addSecondary(e) {
        const primaryName = e.currentTarget.dataset.name;
        wx.showModal({
            title: '新建二级分类（' + primaryName + '）', editable: true, placeholderText: '分类名',
            success: async (r) => {
                if (!r.confirm || !r.content) return;
                try {
                    await request('/categories/secondary', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        data: { primaryName, secondaryName: r.content }
                    });
                    this.load();
                } catch (e) { toast(e.message); }
            }
        });
    },
    async delPrimary(e) {
        const name = e.currentTarget.dataset.name;
        const r = await wx.showModal({ title: '删除一级分类', content: '同时删除其下所有二级分类，确定？' });
        if (!r.confirm) return;
        try { await request('/categories/primary/' + encodeURIComponent(name), { method: 'DELETE' }); this.load(); }
        catch (err) { toast(err.message); }
    },
    async delSecondary(e) {
        const { primary, secondary } = e.currentTarget.dataset;
        const r = await wx.showModal({ title: '删除二级分类', content: secondary });
        if (!r.confirm) return;
        try {
            await request('/categories/secondary', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                data: { primaryName: primary, secondaryName: secondary }
            });
            this.load();
        } catch (err) { toast(err.message); }
    }
});
