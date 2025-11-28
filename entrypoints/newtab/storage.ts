import type { Collection, Group, TabItem } from './types';

const ROOT_FOLDER_NAME = 'TabManager';

// 缓存根文件夹ID
let rootFolderId: string | null = null;

// 检查 bookmarks API 是否可用
function isBookmarksAvailable(): boolean {
  return typeof browser !== 'undefined' && 
         browser.bookmarks && 
         typeof browser.bookmarks.create !== 'undefined';
}

// 获取或创建 TabManager 根文件夹
async function getOrCreateRootFolder(): Promise<string> {
  if (rootFolderId) {
    // 验证缓存的文件夹是否还存在
    try {
      await browser.bookmarks.get(rootFolderId);
      return rootFolderId;
    } catch {
      rootFolderId = null;
    }
  }

  // 搜索现有的 TabManager 文件夹
  const results = await browser.bookmarks.search({ title: ROOT_FOLDER_NAME });
  const existing = results.find(b => !b.url); // 找文件夹，不是书签
  
  if (existing) {
    rootFolderId = existing.id;
    return rootFolderId;
  }

  // 在"其他书签"下创建根文件夹
  // Chrome: '2' 是其他书签, Firefox: 'unfiled_____' 或 'other'
  const otherBookmarksId = '2';
  const folder = await browser.bookmarks.create({
    parentId: otherBookmarksId,
    title: ROOT_FOLDER_NAME
  });
  
  rootFolderId = folder.id;
  return rootFolderId;
}

// 加载所有分组 (Group = TabManager 下的一级文件夹)
export async function loadGroups(): Promise<Group[]> {
  if (!isBookmarksAvailable()) {
    console.error('browser.bookmarks is not available');
    return [];
  }

  try {
    const rootId = await getOrCreateRootFolder();
    const children = await browser.bookmarks.getChildren(rootId);
    
    return children
      .filter(child => !child.url) // 只要文件夹
      .map(folder => ({
        id: folder.id,
        name: folder.title,
        createdAt: folder.dateAdded || Date.now()
      }));
  } catch (e) {
    console.error('Failed to load groups:', e);
    return [];
  }
}


// 加载所有集合 (Collection = 二级文件夹)
export async function loadCollections(): Promise<Collection[]> {
  if (!isBookmarksAvailable()) {
    console.error('browser.bookmarks is not available');
    return [];
  }

  try {
    const groups = await loadGroups();
    const collections: Collection[] = [];

    for (const group of groups) {
      const children = await browser.bookmarks.getChildren(group.id);
      
      for (const child of children) {
        if (!child.url) { // 是文件夹
          const tabs = await loadTabsFromFolder(child.id);
          collections.push({
            id: child.id,
            name: child.title,
            tabs,
            createdAt: child.dateAdded || Date.now(),
            groupId: group.id
          });
        }
      }
    }

    return collections;
  } catch (e) {
    console.error('Failed to load collections:', e);
    return [];
  }
}

// 从文件夹加载标签页(书签)
async function loadTabsFromFolder(folderId: string): Promise<TabItem[]> {
  const children = await browser.bookmarks.getChildren(folderId);
  
  return children
    .filter(child => child.url) // 只要书签
    .map(bookmark => ({
      id: bookmark.id,
      title: bookmark.title,
      url: bookmark.url!,
      favicon: getFaviconUrl(bookmark.url!)
    }));
}

// 获取网站图标URL
function getFaviconUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
  } catch {
    return '';
  }
}

// 创建分组 (在 TabManager 下创建文件夹)
export async function createGroup(name: string): Promise<Group> {
  const rootId = await getOrCreateRootFolder();
  const folder = await browser.bookmarks.create({
    parentId: rootId,
    title: name
  });

  return {
    id: folder.id,
    name: folder.title,
    createdAt: folder.dateAdded || Date.now()
  };
}

// 创建集合 (在分组文件夹下创建子文件夹)
export async function createCollection(name: string, groupId: string): Promise<Collection> {
  const folder = await browser.bookmarks.create({
    parentId: groupId,
    title: name
  });

  return {
    id: folder.id,
    name: folder.title,
    tabs: [],
    createdAt: folder.dateAdded || Date.now(),
    groupId
  };
}

// 添加标签到集合 (在集合文件夹下创建书签)
export async function addTabToCollection(collectionId: string, tab: Omit<TabItem, 'id'>): Promise<TabItem> {
  const bookmark = await browser.bookmarks.create({
    parentId: collectionId,
    title: tab.title,
    url: tab.url
  });

  return {
    id: bookmark.id,
    title: bookmark.title,
    url: bookmark.url!,
    favicon: tab.favicon || getFaviconUrl(bookmark.url!)
  };
}


// 从集合中移除标签 (删除书签)
export async function removeTabFromCollection(tabId: string): Promise<void> {
  await browser.bookmarks.remove(tabId);
}

// 更新分组名称
export async function updateGroup(groupId: string, name: string): Promise<void> {
  await browser.bookmarks.update(groupId, { title: name });
}

// 更新集合名称
export async function updateCollection(collectionId: string, name: string): Promise<void> {
  await browser.bookmarks.update(collectionId, { title: name });
}

// 删除分组 (递归删除文件夹)
export async function deleteGroup(groupId: string): Promise<void> {
  await browser.bookmarks.removeTree(groupId);
}

// 删除集合 (递归删除文件夹)
export async function deleteCollection(collectionId: string): Promise<void> {
  await browser.bookmarks.removeTree(collectionId);
}

// 移动标签到另一个集合
export async function moveTab(tabId: string, targetCollectionId: string): Promise<void> {
  await browser.bookmarks.move(tabId, { parentId: targetCollectionId });
}

// 移动集合到另一个分组
export async function moveCollection(collectionId: string, targetGroupId: string): Promise<void> {
  await browser.bookmarks.move(collectionId, { parentId: targetGroupId });
}

// 移动分组到指定位置（用于排序）
export async function moveGroupToIndex(groupId: string, index: number): Promise<void> {
  const rootId = await getOrCreateRootFolder();
  await browser.bookmarks.move(groupId, { parentId: rootId, index });
}

// 生成ID (兼容旧代码，但实际上书签API会自动生成ID)
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// ============ 兼容旧接口 ============

// 保存分组 (兼容旧代码，实际操作已通过单独的 create/update/delete 完成)
export async function saveGroups(groups: Group[]): Promise<void> {
  // 书签API是实时的，不需要批量保存
  console.log('saveGroups called - bookmarks are saved in real-time');
}

// 保存集合 (兼容旧代码)
export async function saveCollections(collections: Collection[]): Promise<void> {
  // 书签API是实时的，不需要批量保存
  console.log('saveCollections called - bookmarks are saved in real-time');
}

// ============ 侧边栏宽度仍用 storage.local ============

export interface SidebarWidths {
  left: number;
  right: number;
}

const SIDEBAR_WIDTHS_KEY = 'tabmanager_sidebar_widths';

function isStorageAvailable(): boolean {
  return typeof browser !== 'undefined' && 
         browser.storage && 
         typeof browser.storage.local !== 'undefined';
}

export async function loadSidebarWidths(): Promise<SidebarWidths | null> {
  if (!isStorageAvailable()) return null;
  
  try {
    const result = await browser.storage.local.get(SIDEBAR_WIDTHS_KEY);
    return result[SIDEBAR_WIDTHS_KEY] || null;
  } catch (e) {
    console.error('Failed to load sidebar widths:', e);
    return null;
  }
}

export async function saveSidebarWidths(widths: SidebarWidths): Promise<void> {
  if (!isStorageAvailable()) return;
  
  try {
    await browser.storage.local.set({ [SIDEBAR_WIDTHS_KEY]: widths });
  } catch (e) {
    console.error('Failed to save sidebar widths:', e);
  }
}

// 调试函数
export async function debugStorage(): Promise<void> {
  if (!isBookmarksAvailable()) {
    console.error('Bookmarks not available');
    return;
  }
  
  try {
    const rootId = await getOrCreateRootFolder();
    const tree = await browser.bookmarks.getSubTree(rootId);
    console.log('TabManager bookmark tree:', JSON.stringify(tree, null, 2));
  } catch (e) {
    console.error('Failed to get bookmark tree:', e);
  }
}

// ============ 集合 UI 状态存储 ============

export interface CollectionUIState {
  expanded: boolean;
  order: number; // 在分组内的排序位置
}

export interface CollectionUIStates {
  [collectionId: string]: CollectionUIState;
}

const COLLECTION_UI_STATES_KEY = 'tabmanager_collection_ui_states';

export async function loadCollectionUIStates(): Promise<CollectionUIStates> {
  if (!isStorageAvailable()) return {};
  
  try {
    const result = await browser.storage.local.get(COLLECTION_UI_STATES_KEY);
    return result[COLLECTION_UI_STATES_KEY] || {};
  } catch (e) {
    console.error('Failed to load collection UI states:', e);
    return {};
  }
}

export async function saveCollectionUIStates(states: CollectionUIStates): Promise<void> {
  if (!isStorageAvailable()) return;
  
  try {
    await browser.storage.local.set({ [COLLECTION_UI_STATES_KEY]: states });
  } catch (e) {
    console.error('Failed to save collection UI states:', e);
  }
}

// 更新单个集合的 UI 状态
export async function updateCollectionUIState(
  collectionId: string, 
  state: Partial<CollectionUIState>
): Promise<void> {
  const states = await loadCollectionUIStates();
  const existing = states[collectionId] || { expanded: false, order: 0 };
  states[collectionId] = {
    ...existing,
    ...state
  };
  await saveCollectionUIStates(states);
}

// 删除集合时清理 UI 状态
export async function removeCollectionUIState(collectionId: string): Promise<void> {
  const states = await loadCollectionUIStates();
  delete states[collectionId];
  await saveCollectionUIStates(states);
}
