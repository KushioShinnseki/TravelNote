const { decodePacket, applyPacket } = require('../../utils/packet');

const STORAGE_KEY = 'travelnote-wechat-state-v1';

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

Page({
  data: {
    tab: 'destinations',
    state: emptyState(),
    destinations: [],
    plans: [],
    hasData: false,
    lastSync: '尚未同步',
    syncSummary: ''
  },

  onLoad() {
    const saved = wx.getStorageSync(STORAGE_KEY);
    const state = saved && saved.accountId ? saved : emptyState();
    this.renderState(state);
  },

  renderState(state, summary) {
    const view = displayState(state);
    this.setData({
      state: view,
      destinations: view.destinations,
      plans: view.plans,
      hasData: view.hasData,
      lastSync: view.syncedAt ? new Date(view.syncedAt).toLocaleString() : '尚未同步',
      syncSummary: summary || ''
    });
  },

  switchTab(event) {
    this.setData({ tab: event.currentTarget.dataset.tab });
  },

  scan() {
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode'],
      success: result => this.importPacket(result.result),
      fail: error => {
        if (error && error.errMsg && error.errMsg.indexOf('cancel') >= 0) return;
        wx.showToast({ title: '扫码失败', icon: 'none' });
      }
    });
  },

  importPacket(raw) {
    try {
      const packet = decodePacket(raw);
      const current = this.data.state && this.data.state.accountId ? this.data.state : null;
      const result = applyPacket(current, packet);
      wx.setStorageSync(STORAGE_KEY, result.state);
      const summary = `地点 新建 ${result.summary.destinations.created} / 更新 ${result.summary.destinations.updated} / 删除 ${result.summary.destinations.deleted}；日程 新建 ${result.summary.plans.created} / 更新 ${result.summary.plans.updated} / 删除 ${result.summary.plans.deleted}`;
      this.renderState(result.state, summary);
      wx.showModal({ title: '同步完成', content: `账号 ID：${result.summary.accountId}\n${summary}`, showCancel: false });
    } catch (error) {
      wx.showModal({ title: '无法导入', content: error.message || '二维码数据无效', showCancel: false });
    }
  },

  clearBinding() {
    wx.showModal({
      title: '清除账号数据？',
      content: '这会删除小程序本地缓存，需要再次扫码绑定账号。网页数据库不会受到影响。',
      success: result => {
        if (!result.confirm) return;
        wx.removeStorageSync(STORAGE_KEY);
        this.renderState(emptyState(), '已清空本地数据，请重新扫描二维码');
      }
    });
  }
});
