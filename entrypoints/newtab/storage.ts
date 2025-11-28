import type { Collection, Group } from './types';

const COLLECTIONS_KEY = 'toby_collections';
const GROUPS_KEY = 'toby_groups';
const SIDEBAR_WIDTHS_KEY = 'toby_sidebar_widths';

export interface SidebarWidths {
  left: number;
  right: number;
}

// 检查 browser.storage 是否可用
function isStorageAvailable(): boolean {
  return typeof browser !== 'undefined' && 
         browser.storage && 
         typeof browser.storage.local !== 'undefined';
}

export async function loadCollections(): Promise<Collection[]> {
  if (!isStorageAvailable()) {
    console.error('browser.storage is not available');
    return [];
  }
  
  try {
    const result = await browser.storage.local.get(COLLECTIONS_KEY);
    console.log('Loaded collections result:', result);
    const data = result[COLLECTIONS_KEY];
    
    // 确保返回的是数组
    if (Array.isArray(data)) {
      return data;
    }
    
    // 如果是对象，尝试转换为数组（处理旧数据格式）
    if (data && typeof data === 'object') {
      const values = Object.values(data);
      if (values.length > 0 && values.every(v => v && typeof v === 'object' && 'id' in v)) {
        console.log('Converting object to array:', values);
        return values as Collection[];
      }
    }
    
    return [];
  } catch (e) {
    console.error('Failed to load collections:', e);
    return [];
  }
}

export async function saveCollections(collections: Collection[]): Promise<void> {
  if (!isStorageAvailable()) {
    console.error('browser.storage is not available for saving collections');
    return;
  }
  
  if (!Array.isArray(collections)) {
    console.error('Invalid collections data:', collections);
    return;
  }
  
  try {
    // 深拷贝以移除 Vue 响应式代理，确保存储纯数据
    const plainData = JSON.parse(JSON.stringify(collections));
    console.log('Saving collections:', plainData);
    await browser.storage.local.set({ [COLLECTIONS_KEY]: plainData });
    console.log('Collections saved successfully');
    
    // 验证保存是否成功
    const verify = await browser.storage.local.get(COLLECTIONS_KEY);
    console.log('Verified saved collections:', verify);
  } catch (e) {
    console.error('Failed to save collections:', e);
  }
}

export async function loadGroups(): Promise<Group[]> {
  if (!isStorageAvailable()) {
    console.error('browser.storage is not available');
    return [];
  }
  
  try {
    const result = await browser.storage.local.get(GROUPS_KEY);
    console.log('Loaded groups result:', result);
    const data = result[GROUPS_KEY];
    
    // 确保返回的是数组
    if (Array.isArray(data)) {
      return data;
    }
    
    // 如果是对象，尝试转换为数组（处理旧数据格式）
    if (data && typeof data === 'object') {
      const values = Object.values(data);
      if (values.length > 0 && values.every(v => v && typeof v === 'object' && 'id' in v)) {
        console.log('Converting object to array:', values);
        return values as Group[];
      }
    }
    
    return [];
  } catch (e) {
    console.error('Failed to load groups:', e);
    return [];
  }
}

export async function saveGroups(groups: Group[]): Promise<void> {
  if (!isStorageAvailable()) {
    console.error('browser.storage is not available for saving groups');
    return;
  }
  
  if (!Array.isArray(groups)) {
    console.error('Invalid groups data:', groups);
    return;
  }
  
  try {
    // 深拷贝以移除 Vue 响应式代理，确保存储纯数据
    const plainData = JSON.parse(JSON.stringify(groups));
    console.log('Saving groups:', plainData);
    await browser.storage.local.set({ [GROUPS_KEY]: plainData });
    console.log('Groups saved successfully');
    
    // 验证保存是否成功
    const verify = await browser.storage.local.get(GROUPS_KEY);
    console.log('Verified saved groups:', verify);
  } catch (e) {
    console.error('Failed to save groups:', e);
  }
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// 调试函数：检查存储状态
export async function debugStorage(): Promise<void> {
  if (!isStorageAvailable()) {
    console.error('Storage not available');
    return;
  }
  
  try {
    const all = await browser.storage.local.get(null);
    console.log('All storage data:', all);
  } catch (e) {
    console.error('Failed to get storage:', e);
  }
}

// 清除所有存储数据（用于调试）
export async function clearStorage(): Promise<void> {
  if (!isStorageAvailable()) {
    console.error('Storage not available');
    return;
  }
  
  try {
    await browser.storage.local.clear();
    console.log('Storage cleared');
  } catch (e) {
    console.error('Failed to clear storage:', e);
  }
}

// 加载侧边栏宽度
export async function loadSidebarWidths(): Promise<SidebarWidths | null> {
  if (!isStorageAvailable()) {
    return null;
  }
  
  try {
    const result = await browser.storage.local.get(SIDEBAR_WIDTHS_KEY);
    return result[SIDEBAR_WIDTHS_KEY] || null;
  } catch (e) {
    console.error('Failed to load sidebar widths:', e);
    return null;
  }
}

// 保存侧边栏宽度
export async function saveSidebarWidths(widths: SidebarWidths): Promise<void> {
  if (!isStorageAvailable()) {
    return;
  }
  
  try {
    await browser.storage.local.set({ [SIDEBAR_WIDTHS_KEY]: widths });
  } catch (e) {
    console.error('Failed to save sidebar widths:', e);
  }
}
