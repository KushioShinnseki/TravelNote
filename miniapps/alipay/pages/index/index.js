const { decodePacket, applyPacket } = require('../../utils/packet');

const STORAGE_KEY = 'travelnote-alipay-state-v1';

function emptyState() {
  return { format: 'travelnote', version: 3, accountId: '', profile: { home: '' }, tagCatalog: [], destinations: [], plans: [], syncedAt: '' };
}

function displayState(state) {
  const destinations = (state.destinations || []).map(item => ({
    ...item,
    tagsText: (item.tags || []).join(' · '),
    regionText: [item.region, item.location].filter(Boolean).join(' · ')
  }));
  const plans = (state.plans || []).map(item => ({
    ...item,
    dateText: item.date ? item.date.replace(/-/g, '/') : '',
    destinationText: item.destination || item.otherDestination || '未指定地点'
  }));
  return { ...state, destinations, plans, hasData: destinations.length > 0 || plans.length > 0 };
}

function toast(content) { my.showToast({ content, type: 'none', duration: 2000 }); }

Page({
  data: { tab: 'destinations', state: emptyState(), destinations: [], plans: [], hasData: false, lastSync: '尚未同步', syncSummary: '' },

  onLoad() {
    const result = my.getStorageSync({ key: STORAGE_KEY });
    const saved = result && result.data;
    this.renderState(saved && saved.accountId ? saved : emptyState());
  },

  renderState(state, summary) {
    const view = displayState(state);
    this.setData({
      state: view, destinations: view.destinations, plans: view.plans, hasData: view.hasData,
      lastSync: view.syncedAt ? new Date(view.syncedAt).toLocaleString() : '尚未同步', syncSummary: summary || ''
    });
  },

  switchTab(event) { this.setData({ tab: event.currentTarget.dataset.tab }); },

  scan() {
    my.scan({
      type: 'qr',
      success: result => this.importPacket(result.code || result.result || result.qrCode || ''),
      fail: error => { if (!error || !String(error.errorMessage || error.message || '').match(/cancel|取消/i)) toast('扫码失败'); }
    });
  },

  importPacket(raw) {
    try {
      const packet = decodePacket(raw);
      const current = this.data.state && this.data.state.accountId ? this.data.state : null;
      const result = applyPacket(current, packet);
      my.setStorageSync({ key: STORAGE_KEY, data: result.state });
      const summary = `地点 新建 ${result.summary.destinations.created} / 更新 ${result.summary.destinations.updated} / 删除 ${result.summary.destinations.deleted}；日程 新建 ${result.summary.plans.created} / 更新 ${result.summary.plans.updated} / 删除 ${result.summary.plans.deleted}`;
      this.renderState(result.state, summary);
      my.alert({ title: '同步完成', content: `账号 ID：${result.summary.accountId}\n${summary}` });
    } catch (error) {
      my.alert({ title: '无法导入', content: error.message || '二维码数据无效' });
    }
  },

  clearBinding() {
    my.confirm({
      title: '清除账号数据？',
      content: '这会删除小程序本地缓存，需要再次扫码绑定账号。网页数据库不会受到影响。',
      success: result => {
        if (!result.confirm) return;
        my.removeStorageSync({ key: STORAGE_KEY });
        this.renderState(emptyState(), '已清空本地数据，请重新扫描二维码');
      }
    });
  }
});
