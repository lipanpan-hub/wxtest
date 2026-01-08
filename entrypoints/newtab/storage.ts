import type { Collection, Group, TabItem } from './types';

const ROOT_FOLDER_NAME = 'TabManager';
const FOLDER_PREFIX = '📁'; // 分组文件夹的前缀标记

// 缓存根文件夹ID
let rootFolderId: string | null = null;

// 判断是否是分组文件夹（通过名称前缀）
export function isGroupFolder(name: string): boolean {
  return name.startsWith(FOLDER_PREFIX);
}

// 获取显示名称（去除前缀）
export function getDisplayName(name: string): string {
  return isGroupFolder(name) ? name.slice(FOLDER_PREFIX.length) : name;
}

// 获取存储名称（添加前缀）
export function getStorageName(name: string, isFolder: boolean): string {
  if (isFolder && !name.startsWith(FOLDER_PREFIX)) {
    return FOLDER_PREFIX + name;
  }
  return name;
}

// 检查 bookmarks API 是否可用
function isBookmarksAvailable(): boolean {
  return typeof browser !== 'undefined' && 
         browser.bookmarks && 
         typeof browser.bookmarks.create !== 'undefined';
}

// 获取书签栏的根文件夹ID（兼容不同浏览器）
async function getBookmarkRootId(): Promise<string> {
  try {
    // 获取整个书签树
    const tree = await browser.bookmarks.getTree();
    const root = tree[0];
    
    if (root && root.children && root.children.length > 0) {
      // 优先查找 "其他书签" 或 "Other Bookmarks"
      // Chrome/Edge: 通常是 children[1] (id='2')
      // Firefox: 查找 'unfiled_____' 或 'menu________'
      
      for (const child of root.children) {
        // Firefox 的 unfiled 书签
        if (child.id === 'unfiled_____') {
          return child.id;
        }
        // Firefox 的菜单书签
        if (child.id === 'menu________') {
          return child.id;
        }
      }
      
      // Chrome/Edge: 尝试使用 '2' (其他书签)
      for (const child of root.children) {
        if (child.id === '2') {
          return child.id;
        }
      }
      
      // 如果都没找到，使用第一个可用的文件夹
      for (const child of root.children) {
        if (!child.url) { // 是文件夹
          return child.id;
        }
      }
    }
    
    // 最后的回退：返回 '1' (书签栏) 或 '2' (其他书签)
    return '1';
  } catch (e) {
    console.error('Failed to get bookmark root:', e);
    // 回退到 Chrome 默认值
    return '2';
  }
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

  // 动态获取合适的父文件夹ID
  const parentId = await getBookmarkRootId();
  
  const folder = await browser.bookmarks.create({
    parentId: parentId,
    title: ROOT_FOLDER_NAME
  });
  
  rootFolderId = folder.id;
  return rootFolderId;
}

// 加载所有分组 (递归加载，支持分组文件夹)
export async function loadGroups(): Promise<Group[]> {
  if (!isBookmarksAvailable()) {
    console.error('browser.bookmarks is not available');
    return [];
  }

  try {
    const rootId = await getOrCreateRootFolder();
    console.log('Loading groups from root:', rootId);
    const groups = await loadGroupsRecursive(rootId, null);
    console.log('Loaded groups count:', groups.length);
    return groups;
  } catch (e) {
    console.error('Failed to load groups:', e);
    return [];
  }
}

// 递归加载分组
async function loadGroupsRecursive(parentId: string, parentGroupId: string | null): Promise<Group[]> {
  const children = await browser.bookmarks.getChildren(parentId);
  console.log(`Loading children of ${parentId}:`, children.length, 'items');
  const groups: Group[] = [];
  
  for (const child of children) {
    console.log('Processing child:', { id: child.id, title: child.title, hasUrl: !!child.url });
    if (!child.url) { // 只处理文件夹
      const isFolderType = isGroupFolder(child.title);
      const group: Group = {
        id: child.id,
        name: getDisplayName(child.title),
        createdAt: child.dateAdded || Date.now(),
        isFolder: isFolderType,
        parentId: parentGroupId
      };
      groups.push(group);
      
      console.log('Loaded group:', {
        id: group.id,
        name: group.name,
        isFolder: group.isFolder,
        parentId: group.parentId
      });
      
      // 如果是分组文件夹，递归加载子分组
      if (isFolderType) {
        const subGroups = await loadGroupsRecursive(child.id, child.id);
        groups.push(...subGroups);
      }
    }
  }
  
  return groups;
}


// 加载所有集合 (Collection = 普通分组下的文件夹)
export async function loadCollections(): Promise<Collection[]> {
  if (!isBookmarksAvailable()) {
    console.error('browser.bookmarks is not available');
    return [];
  }

  try {
    const groups = await loadGroups();
    const collections: Collection[] = [];

    // 只从普通分组（非分组文件夹）加载集合
    for (const group of groups) {
      if (!group.isFolder) {
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

// 创建分组 (在 TabManager 或分组文件夹下创建)
export async function createGroup(name: string, isFolder: boolean = false, parentId: string | null = null): Promise<Group> {
  const targetParentId = parentId || await getOrCreateRootFolder();
  const storageName = getStorageName(name, isFolder);
  
  console.log('Creating group:', { name, isFolder, parentId, targetParentId, storageName });
  
  const folder = await browser.bookmarks.create({
    parentId: targetParentId,
    title: storageName
  });
  
  console.log('Created bookmark:', folder);

  return {
    id: folder.id,
    name: name,
    createdAt: folder.dateAdded || Date.now(),
    isFolder: isFolder,
    parentId: parentId
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
export async function updateGroup(groupId: string, name: string, isFolder: boolean = false): Promise<void> {
  const storageName = getStorageName(name, isFolder);
  await browser.bookmarks.update(groupId, { title: storageName });
}

// 更新集合名称
export async function updateCollection(collectionId: string, name: string): Promise<void> {
  await browser.bookmarks.update(collectionId, { title: name });
}

// 删除分组 (递归删除文件夹)
export async function deleteGroup(groupId: string): Promise<void> {
  // 直接删除，检查逻辑已在 App.vue 中完成
  await browser.bookmarks.removeTree(groupId);
}

// 移动分组到另一个分组文件夹或根目录
export async function moveGroup(groupId: string, targetParentId: string | null): Promise<void> {
  const parentId = targetParentId || await getOrCreateRootFolder();
  await browser.bookmarks.move(groupId, { parentId });
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
export async function moveGroupToIndex(groupId: string, index: number, parentId?: string | null): Promise<void> {
  const targetParentId = parentId !== undefined && parentId !== null 
    ? parentId 
    : await getOrCreateRootFolder();
  
  console.log('moveGroupToIndex called:', {
    groupId,
    index,
    parentId,
    targetParentId
  });
  
  try {
    // 获取当前书签信息
    const bookmarks = await browser.bookmarks.get(groupId);
    const currentBookmark = bookmarks[0];
    
    console.log('Current bookmark info:', {
      id: currentBookmark.id,
      title: currentBookmark.title,
      currentParentId: currentBookmark.parentId,
      currentIndex: currentBookmark.index
    });
    
    // 如果父级相同且需要移动
    if (currentBookmark.parentId === targetParentId) {
      const currentIndex = currentBookmark.index || 0;
      
      if (currentIndex === index) {
        console.log('Already at target position, no move needed');
        return;
      }
      
      // 策略：先移动到一个临时位置（最后），然后再移动到目标位置
      // 这样可以避免索引计算的复杂性
      
      // 获取父级的所有子项
      const children = await browser.bookmarks.getChildren(targetParentId);
      const lastIndex = children.length - 1;
      
      console.log('Moving in same parent:', {
        currentIndex,
        targetIndex: index,
        totalChildren: children.length,
        strategy: currentIndex < index ? 'forward' : 'backward'
      });
      
      if (currentIndex < index) {
        // 向后移动（从上往下）
        // Chrome bookmarks API 的行为：
        // - index 参数是基于移除源项目之前的数组计算的
        // - 当源项目在目标位置之前时，移除源项目后，目标位置及之后的元素索引会减1
        // - 所以要让项目出现在目标位置，需要使用 index + 1
        // 
        // 例如：[A(0), B(1), C(2)] -> 把 A 移到 C 的位置（期望 [B, C, A]）
        // - 如果使用 index=2，结果是 [B, A, C]（错误）
        // - 如果使用 index=3，结果是 [B, C, A]（正确）
        
        const adjustedIndex = index + 1;
        
        console.log('Forward move:', {
          requestedIndex: index,
          adjustedIndex,
          totalChildren: children.length,
          currentIndex
        });
        
        const result = await browser.bookmarks.move(groupId, { index: adjustedIndex });
        console.log('Forward move result:', result);
      } else {
        // 向前移动（从下往上）
        // 直接使用目标索引
        const result = await browser.bookmarks.move(groupId, { index: index });
        console.log('Backward move result:', result);
      }
    } else {
      // 不同父级，直接移动
      const result = await browser.bookmarks.move(groupId, { parentId: targetParentId, index });
      console.log('Cross-parent move result:', result);
    }
  } catch (e) {
    console.error('browser.bookmarks.move failed:', e);
    throw e;
  }
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

// ============ 侧边栏状态仍用 storage.local ============

export interface SidebarWidths {
  left: number;
  right: number;
}

export interface SidebarState {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  selectedGroupId: string;
}

const SIDEBAR_WIDTHS_KEY = 'tabmanager_sidebar_widths';
const SIDEBAR_STATE_KEY = 'tabmanager_sidebar_state';

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

// 加载侧边栏折叠状态和选中分组
export async function loadSidebarState(): Promise<SidebarState | null> {
  if (!isStorageAvailable()) return null;
  
  try {
    const result = await browser.storage.local.get(SIDEBAR_STATE_KEY);
    return result[SIDEBAR_STATE_KEY] || null;
  } catch (e) {
    console.error('Failed to load sidebar state:', e);
    return null;
  }
}

// 保存侧边栏折叠状态和选中分组
export async function saveSidebarState(state: SidebarState): Promise<void> {
  if (!isStorageAvailable()) return;
  
  try {
    await browser.storage.local.set({ [SIDEBAR_STATE_KEY]: state });
  } catch (e) {
    console.error('Failed to save sidebar state:', e);
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

// ============ 分组文件夹展开状态存储 ============

const FOLDER_EXPANDED_STATES_KEY = 'tabmanager_folder_expanded_states';

// 加载分组文件夹展开状态
export async function loadFolderExpandedStates(): Promise<string[]> {
  if (!isStorageAvailable()) return [];
  
  try {
    const result = await browser.storage.local.get(FOLDER_EXPANDED_STATES_KEY);
    return result[FOLDER_EXPANDED_STATES_KEY] || [];
  } catch (e) {
    console.error('Failed to load folder expanded states:', e);
    return [];
  }
}

// 保存分组文件夹展开状态
export async function saveFolderExpandedStates(folderIds: string[]): Promise<void> {
  if (!isStorageAvailable()) return;
  
  try {
    await browser.storage.local.set({ [FOLDER_EXPANDED_STATES_KEY]: folderIds });
  } catch (e) {
    console.error('Failed to save folder expanded states:', e);
  }
}
