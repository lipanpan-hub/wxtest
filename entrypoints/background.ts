export default defineBackground(() => {
  console.log('Tab Manager background started', { id: browser.runtime.id });

  // 创建右键菜单
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: 'save-tab-to-collection',
      title: '保存到 Tab Manager',
      contexts: ['page'],
    });
  });

  // 处理右键菜单点击
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'save-tab-to-collection' && tab) {
      // 打开新标签页并传递要保存的标签信息
      browser.tabs.create({
        url: browser.runtime.getURL('/newtab.html') + `?saveTab=${encodeURIComponent(JSON.stringify({
          title: tab.title,
          url: tab.url,
          favicon: tab.favIconUrl,
        }))}`,
      });
    }
  });
});
