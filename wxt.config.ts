import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'Tab Manager',
    description: '标签页管理工具 - 类似 Toby',
    permissions: ['tabs', 'storage', 'bookmarks', 'contextMenus'],
  },
});
