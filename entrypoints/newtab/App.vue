<script lang="ts" setup>
import { ref, onMounted, watch, nextTick, computed } from 'vue';
import type { Collection, TabItem, Group } from './types';
import { 
  loadCollections, 
  loadGroups, 
  createGroup as createGroupInBookmarks,
  deleteGroup as deleteGroupInBookmarks,
  updateGroup as updateGroupInBookmarks,
  createCollection as createCollectionInBookmarks,
  deleteCollection as deleteCollectionInBookmarks,
  updateCollection as updateCollectionInBookmarks,
  addTabToCollection,
  removeTabFromCollection,
  moveTab,
  moveGroupToIndex,
  moveGroup as moveGroupInBookmarks,
  debugStorage, 
  loadSidebarWidths, 
  saveSidebarWidths,
  loadSidebarState,
  saveSidebarState,
  loadCollectionUIStates,
  saveCollectionUIStates,
  updateCollectionUIState,
  removeCollectionUIState,
  type CollectionUIStates
} from './storage';

// 定义 Tab 类型
interface BrowserTab {
  id?: number;
  url?: string;
  title?: string;
  favIconUrl?: string;
}

const collections = ref<Collection[]>([]);
const groups = ref<Group[]>([]);
const selectedGroupId = ref<string>('');
const isLoading = ref(true); // 开始时为 true，防止 watch 在数据加载前触发保存

// 弹窗状态
const showAddCollection = ref(false);
const showAddGroup = ref(false);
const newCollectionName = ref('');
const newGroupName = ref('');
const newGroupIsFolder = ref(false); // 新建分组是否为分组文件夹
const newGroupParentId = ref<string | null>(null); // 新建分组的父级ID
const newCollectionInput = ref<HTMLInputElement | null>(null);
const newGroupInput = ref<HTMLInputElement | null>(null);

// 编辑状态
const editingCollectionId = ref<string | null>(null);
const editingGroupId = ref<string | null>(null);
const editingTabId = ref<string | null>(null);
const editingName = ref('');

// 分组文件夹展开状态
const expandedFolders = ref<Set<string>>(new Set());

// 当前打开的标签页
const openTabs = ref<BrowserTab[]>([]);
const showOpenTabs = ref(true);
const showGroups = ref(true);

// 侧边栏宽度
const leftSidebarWidth = ref(260);
const rightSidebarWidth = ref(220);
const isResizingLeft = ref(false);
const isResizingRight = ref(false);

// 开始调整左侧边栏宽度
function startResizeLeft(e: MouseEvent) {
  if (!showOpenTabs.value) return;
  isResizingLeft.value = true;
  document.addEventListener('mousemove', resizeLeft);
  document.addEventListener('mouseup', stopResizeLeft);
  e.preventDefault();
}

function resizeLeft(e: MouseEvent) {
  if (!isResizingLeft.value) return;
  const newWidth = e.clientX;
  if (newWidth >= 180 && newWidth <= 400) {
    leftSidebarWidth.value = newWidth;
  }
}

function stopResizeLeft() {
  isResizingLeft.value = false;
  document.removeEventListener('mousemove', resizeLeft);
  document.removeEventListener('mouseup', stopResizeLeft);
  // 保存宽度
  saveSidebarWidths({ left: leftSidebarWidth.value, right: rightSidebarWidth.value });
}

// 开始调整右侧边栏宽度
function startResizeRight(e: MouseEvent) {
  if (!showGroups.value) return;
  isResizingRight.value = true;
  document.addEventListener('mousemove', resizeRight);
  document.addEventListener('mouseup', stopResizeRight);
  e.preventDefault();
}

function resizeRight(e: MouseEvent) {
  if (!isResizingRight.value) return;
  const newWidth = window.innerWidth - e.clientX;
  if (newWidth >= 150 && newWidth <= 350) {
    rightSidebarWidth.value = newWidth;
  }
}

function stopResizeRight() {
  isResizingRight.value = false;
  document.removeEventListener('mousemove', resizeRight);
  document.removeEventListener('mouseup', stopResizeRight);
  // 保存宽度
  saveSidebarWidths({ left: leftSidebarWidth.value, right: rightSidebarWidth.value });
}

// 拖拽状态
const draggedTab = ref<{ collectionId: string; tabId: string } | null>(null);
const draggedOpenTab = ref<BrowserTab | null>(null);
const dragOverCollectionId = ref<string | null>(null);

// 集合拖拽排序状态
const draggedCollection = ref<string | null>(null);
const dragOverCollectionForSort = ref<string | null>(null);

// 标签排序状态
const dragOverTabId = ref<string | null>(null);

// 分组拖拽排序状态
const draggedGroup = ref<string | null>(null);
const dragOverGroupId = ref<string | null>(null);
const dragOverGroupAction = ref<'sort' | 'move-into' | null>(null); // 区分排序和移入文件夹

// 当前分组的集合（按顺序）
const currentCollections = computed(() => {
  if (!selectedGroupId.value) return [];
  return collections.value.filter(c => c.groupId === selectedGroupId.value);
});

// 顶级分组（parentId 为 null）
const topLevelGroups = computed(() => {
  return groups.value.filter(g => g.parentId === null);
});

// 获取分组文件夹的子分组
function getChildGroups(folderId: string): Group[] {
  return groups.value.filter(g => g.parentId === folderId);
}

// 切换分组文件夹展开状态
function toggleFolderExpand(folderId: string) {
  if (expandedFolders.value.has(folderId)) {
    expandedFolders.value.delete(folderId);
  } else {
    expandedFolders.value.add(folderId);
  }
}

// 打开新建子分组弹窗
function openAddSubGroup(parentId: string) {
  newGroupParentId.value = parentId;
  newGroupIsFolder.value = false;
  showAddGroup.value = true;
}

// 打开新建分组文件夹弹窗
function openAddGroupFolder() {
  newGroupParentId.value = null;
  newGroupIsFolder.value = true;
  showAddGroup.value = true;
}

// 打开新建普通分组弹窗
function openAddGroup() {
  newGroupParentId.value = null;
  newGroupIsFolder.value = false;
  showAddGroup.value = true;
}

// 监听弹窗打开
watch(showAddCollection, async (val) => {
  if (val) {
    await nextTick();
    newCollectionInput.value?.focus();
  }
});

watch(showAddGroup, async (val) => {
  if (val) {
    await nextTick();
    newGroupInput.value?.focus();
  }
});

// 加载当前打开的标签（所有窗口）
async function loadOpenTabs() {
  const tabs = await browser.tabs.query({});
  openTabs.value = tabs.filter((tab) => {
    if (!tab.url) return false;
    const excludeUrls = ['chrome://', 'chrome-extension://', 'about:', 'edge://', 'brave://'];
    return !excludeUrls.some(prefix => tab.url!.startsWith(prefix));
  });
}

onMounted(async () => {
  console.log('App mounted, checking browser API...');
  console.log('browser object:', typeof browser);
  console.log('browser.storage:', typeof browser?.storage);
  
  // 调试存储状态
  await debugStorage();
  
  try {
    // 加载侧边栏宽度
    const savedWidths = await loadSidebarWidths();
    if (savedWidths) {
      leftSidebarWidth.value = savedWidths.left;
      rightSidebarWidth.value = savedWidths.right;
    }
    
    // 加载侧边栏折叠状态和选中分组
    const savedState = await loadSidebarState();
    if (savedState) {
      showOpenTabs.value = !savedState.leftCollapsed;
      showGroups.value = !savedState.rightCollapsed;
    }
    
    const loadedGroups = await loadGroups();
    const loadedCollections = await loadCollections();
    const uiStates = await loadCollectionUIStates();
    
    console.log('Loaded groups:', loadedGroups);
    console.log('Loaded collections:', loadedCollections);
    console.log('Loaded UI states:', uiStates);
    
    // 确保是数组
    groups.value = Array.isArray(loadedGroups) ? loadedGroups : [];
    
    // 应用 UI 状态到集合
    let collectionsWithState = Array.isArray(loadedCollections) ? loadedCollections : [];
    collectionsWithState = collectionsWithState.map(c => ({
      ...c,
      expanded: uiStates[c.id]?.expanded || false
    }));
    
    // 按保存的顺序排序集合
    collectionsWithState.sort((a, b) => {
      const orderA = uiStates[a.id]?.order ?? Infinity;
      const orderB = uiStates[b.id]?.order ?? Infinity;
      return orderA - orderB;
    });
    
    collections.value = collectionsWithState;
    
    // 恢复选中的分组，如果保存的分组不存在则选中第一个
    if (savedState?.selectedGroupId && groups.value.some(g => g.id === savedState.selectedGroupId)) {
      selectedGroupId.value = savedState.selectedGroupId;
    } else if (groups.value.length > 0) {
      selectedGroupId.value = groups.value[0].id;
    }
    
    await loadOpenTabs();
  } catch (e) {
    console.error('Failed to load data:', e);
    // 确保出错时也是数组
    groups.value = [];
    collections.value = [];
  } finally {
    // 数据加载完成，允许 watch 保存数据
    isLoading.value = false;
  }
});

// 书签 API 是实时的，不需要 watch 自动保存

// 监听侧边栏折叠状态和选中分组变化，自动保存
watch([showOpenTabs, showGroups, selectedGroupId], async () => {
  if (isLoading.value) return;
  await saveSidebarState({
    leftCollapsed: !showOpenTabs.value,
    rightCollapsed: !showGroups.value,
    selectedGroupId: selectedGroupId.value
  });
}, { deep: true });

// 创建新分组
async function createGroup() {
  if (!newGroupName.value.trim()) return;
  
  try {
    const newGroup = await createGroupInBookmarks(
      newGroupName.value.trim(), 
      newGroupIsFolder.value,
      newGroupParentId.value
    );
    groups.value.push(newGroup);
    
    // 如果是在分组文件夹下创建，自动展开该文件夹
    if (newGroupParentId.value) {
      expandedFolders.value.add(newGroupParentId.value);
    }
    
    // 如果创建的是普通分组，选中它
    if (!newGroupIsFolder.value) {
      selectedGroupId.value = newGroup.id;
    }
    
    newGroupName.value = '';
    newGroupIsFolder.value = false;
    newGroupParentId.value = null;
    showAddGroup.value = false;
  } catch (e) {
    console.error('Failed to create group:', e);
    alert('创建分组失败');
  }
}

// 删除分组
async function deleteGroup(id: string) {
  const group = groups.value.find(g => g.id === id);
  const message = group?.isFolder 
    ? '确定删除这个分组文件夹吗？文件夹内的子分组也会被删除。'
    : '确定删除这个分组吗？分组内的集合也会被删除。';
    
  if (confirm(message)) {
    try {
      // 如果是分组文件夹，先递归删除子分组
      if (group?.isFolder) {
        const childGroups = getChildGroups(id);
        for (const child of childGroups) {
          await deleteGroupInBookmarks(child.id);
          collections.value = collections.value.filter(c => c.groupId !== child.id);
          groups.value = groups.value.filter(g => g.id !== child.id);
        }
      }
      
      await deleteGroupInBookmarks(id);
      collections.value = collections.value.filter(c => c.groupId !== id);
      groups.value = groups.value.filter(g => g.id !== id);
      
      if (selectedGroupId.value === id) {
        // 选择第一个可用的普通分组
        const firstGroup = groups.value.find(g => !g.isFolder);
        selectedGroupId.value = firstGroup?.id || '';
      }
    } catch (e: any) {
      console.error('Failed to delete group:', e);
      alert(e.message || '删除分组失败');
    }
  }
}

// 开始编辑分组名称
function startEditGroup(group: Group) {
  editingGroupId.value = group.id;
  editingName.value = group.name;
}

// 保存分组名称
async function saveGroupName(group: Group) {
  if (editingName.value.trim()) {
    try {
      await updateGroupInBookmarks(group.id, editingName.value.trim(), group.isFolder);
      group.name = editingName.value.trim();
    } catch (e) {
      console.error('Failed to update group name:', e);
    }
  }
  editingGroupId.value = null;
}

// 分组拖拽开始
function onGroupDragStart(groupId: string, event: DragEvent) {
  draggedGroup.value = groupId;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', groupId);
  }
}

// 分组拖拽经过
function onGroupDragOver(groupId: string, event: DragEvent) {
  if (!draggedGroup.value || draggedGroup.value === groupId) return;
  
  const draggedGroupData = groups.value.find(g => g.id === draggedGroup.value);
  const targetGroup = groups.value.find(g => g.id === groupId);
  
  if (!draggedGroupData || !targetGroup) return;
  
  // 不允许将分组拖入自己的子分组
  if (targetGroup.parentId === draggedGroup.value) return;
  
  // 分组文件夹只能在顶级排序，不能拖入其他文件夹
  if (draggedGroupData.isFolder && targetGroup.parentId !== null) return;
  
  event.preventDefault();
  dragOverGroupId.value = groupId;
  
  // 判断操作类型
  if (targetGroup.isFolder && !draggedGroupData.isFolder && draggedGroupData.parentId !== groupId) {
    dragOverGroupAction.value = 'move-into';
  } else {
    dragOverGroupAction.value = 'sort';
  }
}

// 分组放置（排序或移入文件夹）
async function onGroupDrop(targetGroupId: string, event: DragEvent) {
  event.preventDefault();
  
  if (!draggedGroup.value || draggedGroup.value === targetGroupId) {
    resetGroupDragState();
    return;
  }
  
  const draggedGroupData = groups.value.find(g => g.id === draggedGroup.value);
  const targetGroup = groups.value.find(g => g.id === targetGroupId);
  
  if (!draggedGroupData || !targetGroup) {
    resetGroupDragState();
    return;
  }
  
  try {
    // 情况1: 普通分组拖入分组文件夹
    if (targetGroup.isFolder && !draggedGroupData.isFolder && draggedGroupData.parentId !== targetGroupId) {
      await moveGroupInBookmarks(draggedGroup.value, targetGroupId);
      draggedGroupData.parentId = targetGroupId;
      expandedFolders.value.add(targetGroupId);
    }
    // 情况2: 同级排序（都在顶级或都在同一文件夹内）
    else if (draggedGroupData.parentId === targetGroup.parentId) {
      await reorderGroups(draggedGroupData, targetGroup);
    }
    // 情况3: 从文件夹内拖到顶级分组位置（移出并排序）
    else if (draggedGroupData.parentId !== null && targetGroup.parentId === null && !targetGroup.isFolder) {
      await moveGroupInBookmarks(draggedGroup.value, null);
      draggedGroupData.parentId = null;
      await reorderGroups(draggedGroupData, targetGroup);
    }
  } catch (e) {
    console.error('Failed to move/reorder group:', e);
  }
  
  resetGroupDragState();
}

// 重新排序分组
async function reorderGroups(draggedGroupData: Group, targetGroup: Group) {
  const parentId = draggedGroupData.parentId;
  
  // 获取同级分组列表
  const siblings = parentId === null 
    ? groups.value.filter(g => g.parentId === null)
    : groups.value.filter(g => g.parentId === parentId);
  
  const sourceIndex = siblings.findIndex(g => g.id === draggedGroupData.id);
  const targetIndex = siblings.findIndex(g => g.id === targetGroup.id);
  
  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return;
  
  // 更新本地数组顺序
  const globalSourceIndex = groups.value.findIndex(g => g.id === draggedGroupData.id);
  const globalTargetIndex = groups.value.findIndex(g => g.id === targetGroup.id);
  
  if (globalSourceIndex > -1 && globalTargetIndex > -1) {
    const [movedGroup] = groups.value.splice(globalSourceIndex, 1);
    groups.value.splice(globalTargetIndex, 0, movedGroup);
  }
  
  // 同步到书签 - 计算在父级内的新位置
  const newIndex = targetIndex > sourceIndex ? targetIndex : targetIndex;
  await moveGroupToPosition(draggedGroupData.id, parentId, newIndex);
}

// 移动分组到指定位置
async function moveGroupToPosition(groupId: string, parentId: string | null, index: number) {
  try {
    if (parentId === null) {
      await moveGroupToIndex(groupId, index);
    } else {
      // 在文件夹内移动
      await browser.bookmarks.move(groupId, { parentId, index });
    }
  } catch (e) {
    console.error('Failed to move group to position:', e);
  }
}

// 重置拖拽状态
function resetGroupDragState() {
  draggedGroup.value = null;
  dragOverGroupId.value = null;
  dragOverGroupAction.value = null;
}

// 将分组移出文件夹到顶级
async function moveGroupToRoot(groupId: string) {
  const group = groups.value.find(g => g.id === groupId);
  if (!group || !group.parentId) return;
  
  try {
    await moveGroupInBookmarks(groupId, null);
    group.parentId = null;
  } catch (e) {
    console.error('Failed to move group to root:', e);
  }
}

// 分组拖拽结束
function onGroupDragEnd() {
  resetGroupDragState();
}

// 创建新集合
async function createCollection() {
  if (!newCollectionName.value.trim() || !selectedGroupId.value) return;
  
  try {
    const newCollection = await createCollectionInBookmarks(newCollectionName.value.trim(), selectedGroupId.value);
    collections.value.push(newCollection);
    newCollectionName.value = '';
    showAddCollection.value = false;
  } catch (e) {
    console.error('Failed to create collection:', e);
    alert('创建集合失败');
  }
}

// 删除集合
async function deleteCollection(id: string) {
  if (confirm('确定删除这个集合吗？')) {
    try {
      await deleteCollectionInBookmarks(id);
      await removeCollectionUIState(id);
      collections.value = collections.value.filter(c => c.id !== id);
    } catch (e) {
      console.error('Failed to delete collection:', e);
      alert('删除集合失败');
    }
  }
}

// 切换集合放大/缩小状态
async function toggleCollectionExpand(collection: Collection) {
  collection.expanded = !collection.expanded;
  // 保存展开状态
  await updateCollectionUIState(collection.id, { expanded: collection.expanded });
}

// 开始编辑集合名称
function startEditCollection(collection: Collection) {
  editingCollectionId.value = collection.id;
  editingName.value = collection.name;
}

// 保存集合名称
async function saveCollectionName(collection: Collection) {
  if (editingName.value.trim()) {
    try {
      await updateCollectionInBookmarks(collection.id, editingName.value.trim());
      collection.name = editingName.value.trim();
    } catch (e) {
      console.error('Failed to update collection name:', e);
    }
  }
  editingCollectionId.value = null;
}

// 检查 URL 是否有效（过滤系统页面和空白页）
function isValidTabUrl(url: string | undefined): boolean {
  if (!url) return false;
  const excludeUrls = ['chrome://', 'chrome-extension://', 'about:', 'edge://', 'brave://', 'javascript:'];
  return !excludeUrls.some(prefix => url.startsWith(prefix));
}

// 保存当前所有标签到集合
async function saveCurrentTabs(collectionId: string) {
  const tabs = await browser.tabs.query({ currentWindow: true });
  const collection = collections.value.find(c => c.id === collectionId);
  
  if (collection) {
    const existingUrls = new Set(collection.tabs.map(t => t.url));
    
    for (const tab of tabs) {
      if (isValidTabUrl(tab.url) && !existingUrls.has(tab.url!)) {
        try {
          const newTab = await addTabToCollection(collectionId, {
            title: tab.title || 'Untitled',
            url: tab.url!,
            favicon: tab.favIconUrl || '',
          });
          collection.tabs.push(newTab);
        } catch (e) {
          console.error('Failed to add tab:', e);
        }
      }
    }
  }
}

// 打开集合中的所有标签
function openAllTabs(collection: Collection) {
  collection.tabs.forEach(tab => {
    browser.tabs.create({ url: tab.url, active: false });
  });
}

// 打开单个标签
function openTab(url: string) {
  browser.tabs.create({ url });
}

// 删除标签
async function deleteTab(collectionId: string, tabId: string) {
  const collection = collections.value.find(c => c.id === collectionId);
  if (collection) {
    try {
      await removeTabFromCollection(tabId);
      collection.tabs = collection.tabs.filter(t => t.id !== tabId);
    } catch (e) {
      console.error('Failed to delete tab:', e);
    }
  }
}

// 开始编辑标签
function startEditTab(collectionId: string, tab: TabItem) {
  editingTabId.value = tab.id;
  editingName.value = tab.title;
}

// 保存标签名称
async function saveTabName(collectionId: string, tabId: string) {
  const collection = collections.value.find(c => c.id === collectionId);
  if (collection) {
    const tab = collection.tabs.find(t => t.id === tabId);
    if (tab && editingName.value.trim()) {
      try {
        await browser.bookmarks.update(tabId, { title: editingName.value.trim() });
        tab.title = editingName.value.trim();
      } catch (e) {
        console.error('Failed to update tab name:', e);
      }
    }
  }
  editingTabId.value = null;
}

// 拖拽开始（集合内的标签）
function onDragStart(collectionId: string, tabId: string) {
  draggedTab.value = { collectionId, tabId };
  draggedOpenTab.value = null;
}

// 拖拽开始（当前打开的标签）
function onDragStartOpenTab(tab: BrowserTab) {
  draggedOpenTab.value = tab;
  draggedTab.value = null;
}

// 拖拽结束
function onDragEnd() {
  draggedTab.value = null;
  draggedOpenTab.value = null;
  dragOverCollectionId.value = null;
  draggedCollection.value = null;
  dragOverCollectionForSort.value = null;
  dragOverTabId.value = null;
}

// 标签拖拽经过（用于排序）
function onTabDragOver(collectionId: string, tabId: string, event: DragEvent) {
  event.preventDefault();
  event.stopPropagation();
  
  // 如果是从左侧拖入的标签，显示集合高亮
  if (draggedOpenTab.value) {
    dragOverCollectionId.value = collectionId;
    return;
  }
  
  // 如果是集合内标签拖拽
  if (draggedTab.value && draggedTab.value.tabId !== tabId) {
    dragOverTabId.value = tabId;
  }
}

// 标签放置（排序或移动）
async function onTabDrop(collectionId: string, targetTabId: string, event: DragEvent) {
  event.preventDefault();
  event.stopPropagation();
  
  const collection = collections.value.find(c => c.id === collectionId);
  if (!collection) return;
  
  // 处理从左侧拖入的标签
  if (draggedOpenTab.value) {
    const tab = draggedOpenTab.value;
    if (tab.url && isValidTabUrl(tab.url)) {
      const exists = collection.tabs.some(t => t.url === tab.url);
      if (!exists) {
        try {
          const targetIndex = collection.tabs.findIndex(t => t.id === targetTabId);
          const newTab = await addTabToCollection(collectionId, {
            title: tab.title || tab.url,
            url: tab.url,
            favicon: tab.favIconUrl || '',
          });
          if (targetIndex > -1) {
            collection.tabs.splice(targetIndex, 0, newTab);
          } else {
            collection.tabs.push(newTab);
          }
        } catch (e) {
          console.error('Failed to add tab:', e);
        }
      }
    }
    draggedOpenTab.value = null;
    dragOverTabId.value = null;
    return;
  }
  
  // 处理集合内标签排序
  if (draggedTab.value) {
    const { collectionId: sourceCollectionId, tabId: sourceTabId } = draggedTab.value;
    
    if (sourceCollectionId === collectionId) {
      // 同一集合内排序 - 书签API不支持排序，只更新本地状态
      const sourceIndex = collection.tabs.findIndex(t => t.id === sourceTabId);
      const targetIndex = collection.tabs.findIndex(t => t.id === targetTabId);
      
      if (sourceIndex > -1 && targetIndex > -1 && sourceIndex !== targetIndex) {
        const [movedTab] = collection.tabs.splice(sourceIndex, 1);
        collection.tabs.splice(targetIndex, 0, movedTab);
      }
    } else {
      // 跨集合移动
      const sourceCollection = collections.value.find(c => c.id === sourceCollectionId);
      if (sourceCollection) {
        const sourceIndex = sourceCollection.tabs.findIndex(t => t.id === sourceTabId);
        const sourceTab = sourceCollection.tabs[sourceIndex];
        const targetIndex = collection.tabs.findIndex(t => t.id === targetTabId);
        
        // 检查目标集合是否已有相同 URL
        const exists = collection.tabs.some(t => t.url === sourceTab?.url);
        
        if (sourceIndex > -1 && !exists) {
          try {
            await moveTab(sourceTabId, collectionId);
            const [movedTab] = sourceCollection.tabs.splice(sourceIndex, 1);
            if (targetIndex > -1) {
              collection.tabs.splice(targetIndex, 0, movedTab);
            } else {
              collection.tabs.push(movedTab);
            }
          } catch (e) {
            console.error('Failed to move tab:', e);
          }
        }
      }
    }
  }
  
  draggedTab.value = null;
  dragOverTabId.value = null;
}

// 集合拖拽开始
function onCollectionDragStart(collectionId: string, event: DragEvent) {
  draggedCollection.value = collectionId;
  draggedTab.value = null;
  draggedOpenTab.value = null;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
  }
}

// 集合拖拽经过
function onCollectionDragOver(collectionId: string, event: DragEvent) {
  if (!draggedCollection.value || draggedCollection.value === collectionId) return;
  event.preventDefault();
  dragOverCollectionForSort.value = collectionId;
}

// 集合放置（排序）
async function onCollectionDrop(targetCollectionId: string, event: DragEvent) {
  event.preventDefault();
  
  if (!draggedCollection.value || draggedCollection.value === targetCollectionId) {
    draggedCollection.value = null;
    dragOverCollectionForSort.value = null;
    return;
  }
  
  const sourceIndex = collections.value.findIndex(c => c.id === draggedCollection.value);
  const targetIndex = collections.value.findIndex(c => c.id === targetCollectionId);
  
  if (sourceIndex > -1 && targetIndex > -1) {
    const [movedCollection] = collections.value.splice(sourceIndex, 1);
    collections.value.splice(targetIndex, 0, movedCollection);
    
    // 保存集合顺序
    await saveCollectionOrder();
  }
  
  draggedCollection.value = null;
  dragOverCollectionForSort.value = null;
}

// 保存集合顺序
async function saveCollectionOrder() {
  const states = await loadCollectionUIStates();
  collections.value.forEach((c, index) => {
    states[c.id] = {
      ...states[c.id],
      expanded: c.expanded || false,
      order: index
    };
  });
  await saveCollectionUIStates(states);
}

// 拖拽经过集合
function onDragOverCollection(collectionId: string, event: DragEvent) {
  event.preventDefault();
  dragOverCollectionId.value = collectionId;
}

// 放置到集合
async function onDropToCollection(targetCollectionId: string, event: DragEvent) {
  event.preventDefault();
  
  const targetCollection = collections.value.find(c => c.id === targetCollectionId);
  if (!targetCollection) return;

  if (draggedOpenTab.value) {
    const tab = draggedOpenTab.value;
    if (tab.url && isValidTabUrl(tab.url)) {
      const exists = targetCollection.tabs.some(t => t.url === tab.url);
      if (!exists) {
        try {
          const newTab = await addTabToCollection(targetCollectionId, {
            title: tab.title || tab.url,
            url: tab.url,
            favicon: tab.favIconUrl || '',
          });
          targetCollection.tabs.push(newTab);
        } catch (e) {
          console.error('Failed to add tab:', e);
        }
      }
    }
    draggedOpenTab.value = null;
    dragOverCollectionId.value = null;
    return;
  }

  if (draggedTab.value) {
    const { collectionId: sourceCollectionId, tabId } = draggedTab.value;
    
    if (sourceCollectionId === targetCollectionId) {
      draggedTab.value = null;
      dragOverCollectionId.value = null;
      return;
    }
    
    const sourceCollection = collections.value.find(c => c.id === sourceCollectionId);
    
    if (sourceCollection) {
      const tabIndex = sourceCollection.tabs.findIndex(t => t.id === tabId);
      if (tabIndex > -1) {
        const sourceTab = sourceCollection.tabs[tabIndex];
        // 检查目标集合是否已有相同 URL
        const exists = targetCollection.tabs.some(t => t.url === sourceTab.url);
        if (!exists) {
          try {
            await moveTab(tabId, targetCollectionId);
            const [tab] = sourceCollection.tabs.splice(tabIndex, 1);
            targetCollection.tabs.push(tab);
          } catch (e) {
            console.error('Failed to move tab:', e);
          }
        }
      }
    }
  }
  
  draggedTab.value = null;
  draggedOpenTab.value = null;
  dragOverCollectionId.value = null;
}

// 获取 favicon URL
function getFaviconUrl(url: string, favicon: string): string {
  if (favicon) return favicon;
  try {
    const urlObj = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
  } catch {
    return '';
  }
}


</script>

<template>
  <div class="app-layout">
    <!-- 左侧：当前打开的标签 -->
    <aside 
      class="sidebar left-sidebar" 
      :class="{ collapsed: !showOpenTabs }"
      :style="{ width: showOpenTabs ? leftSidebarWidth + 'px' : '50px' }"
    >
      <div class="sidebar-header">
        <h2 v-if="showOpenTabs">当前标签 ({{ openTabs.length }})</h2>
        <button class="btn-toggle" @click="showOpenTabs = !showOpenTabs">
          {{ showOpenTabs ? '◀' : '▶' }}
        </button>
      </div>
      <div v-if="showOpenTabs" class="open-tabs-list">
        <div
          v-for="tab in openTabs"
          :key="tab.id"
          class="open-tab-item"
          draggable="true"
          @dragstart="onDragStartOpenTab(tab)"
          @dragend="onDragEnd"
        >
          <img
            :src="tab.favIconUrl || getFaviconUrl(tab.url || '', '')"
            class="tab-favicon"
            @error="($event.target as HTMLImageElement).style.display = 'none'"
          />
          <span class="tab-title" :title="tab.url">{{ tab.title }}</span>
        </div>
        <button class="btn-refresh" @click="loadOpenTabs">🔄 刷新列表</button>
      </div>
    </aside>
    
    <!-- 左侧拖拽条 -->
    <div 
      v-if="showOpenTabs"
      class="resize-handle resize-handle-left"
      @mousedown="startResizeLeft"
    ></div>

    <!-- 中间：主内容区 -->
    <div class="main-content">
      <header class="header">
        <h1>Tab Manager</h1>
        <div class="header-actions">
          <button class="btn-primary" @click="showAddCollection = true" :disabled="!selectedGroupId">
            + 新建集合
          </button>
        </div>
      </header>

      <!-- 集合列表（双列） -->
      <div class="collections-wrapper">
        <div class="collections-grid">
        <div
          v-for="collection in currentCollections"
          :key="collection.id"
          class="collection-card"
          :class="{ 
            'drag-over': dragOverCollectionId === collection.id,
            'drag-over-sort': dragOverCollectionForSort === collection.id,
            'dragging': draggedCollection === collection.id,
            'expanded': collection.expanded
          }"
          draggable="true"
          @dragstart="onCollectionDragStart(collection.id, $event)"
          @dragover="draggedCollection ? onCollectionDragOver(collection.id, $event) : onDragOverCollection(collection.id, $event)"
          @dragleave="dragOverCollectionId = null; dragOverCollectionForSort = null"
          @drop="draggedCollection ? onCollectionDrop(collection.id, $event) : onDropToCollection(collection.id, $event)"
          @dragend="onDragEnd"
        >
          <div class="collection-header">
            <template v-if="editingCollectionId === collection.id">
              <input
                v-model="editingName"
                type="text"
                class="edit-input"
                @keyup.enter="saveCollectionName(collection)"
                @blur="saveCollectionName(collection)"
                autofocus
              />
            </template>
            <template v-else>
              <h3 @dblclick="startEditCollection(collection)">{{ collection.name }}</h3>
            </template>
            <div class="collection-actions">
              <button class="btn-icon" :title="collection.expanded ? '缩小' : '放大'" @click="toggleCollectionExpand(collection)">
                {{ collection.expanded ? '🗗' : '🗖' }}
              </button>
              <button class="btn-icon" title="保存当前标签" @click="saveCurrentTabs(collection.id)">📥</button>
              <button class="btn-icon" title="打开所有" @click="openAllTabs(collection)">🚀</button>
              <button class="btn-icon" title="删除集合" @click="deleteCollection(collection.id)">🗑️</button>
            </div>
          </div>

          <div class="tabs-list">
            <div
              v-for="tab in collection.tabs"
              :key="tab.id"
              class="tab-item"
              :class="{ 
                'drag-over-tab': dragOverTabId === tab.id,
                'dragging-tab': draggedTab?.tabId === tab.id
              }"
              draggable="true"
              @dragstart.stop="onDragStart(collection.id, tab.id)"
              @dragover="onTabDragOver(collection.id, tab.id, $event)"
              @dragleave="dragOverTabId = null"
              @drop="onTabDrop(collection.id, tab.id, $event)"
              @dragend="onDragEnd"
            >
              <img
                :src="getFaviconUrl(tab.url, tab.favicon)"
                class="tab-favicon"
                @error="($event.target as HTMLImageElement).style.display = 'none'"
              />
              <template v-if="editingTabId === tab.id">
                <input
                  v-model="editingName"
                  type="text"
                  class="tab-edit-input"
                  @keyup.enter="saveTabName(collection.id, tab.id)"
                  @blur="saveTabName(collection.id, tab.id)"
                  @click.stop
                  autofocus
                />
              </template>
              <template v-else>
                <span class="tab-title" @click="openTab(tab.url)" :title="tab.url">{{ tab.title }}</span>
              </template>
              <div class="tab-actions">
                <button class="btn-edit-tab" @click.stop="startEditTab(collection.id, tab)" title="编辑">✏️</button>
                <button class="btn-delete" @click.stop="deleteTab(collection.id, tab.id)" title="删除">×</button>
              </div>
            </div>
            
            <div v-if="collection.tabs.length === 0" class="empty-hint">
              从左侧拖拽标签到这里
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-if="currentCollections.length === 0 && selectedGroupId" class="empty-state">
          <p>当前分组还没有集合</p>
          <p>点击「新建集合」开始整理</p>
        </div>
        <div v-if="!selectedGroupId" class="empty-state">
          <p>请先在右侧创建一个分组</p>
        </div>
        </div>
      </div>
    </div>

    <!-- 右侧拖拽条 -->
    <div 
      v-if="showGroups"
      class="resize-handle resize-handle-right"
      @mousedown="startResizeRight"
    ></div>

    <!-- 右侧：分组管理 -->
    <aside 
      class="sidebar right-sidebar" 
      :class="{ collapsed: !showGroups }"
      :style="{ width: showGroups ? rightSidebarWidth + 'px' : '50px' }"
    >
      <div class="sidebar-header">
        <button class="btn-toggle" @click="showGroups = !showGroups">
          {{ showGroups ? '▶' : '◀' }}
        </button>
        <h2 v-if="showGroups">分组</h2>
        <div v-if="showGroups" class="header-buttons">
          <button class="btn-add-folder" @click="openAddGroupFolder" title="新建分组文件夹">📁+</button>
          <button class="btn-add-group" @click="openAddGroup" title="新建分组">+</button>
        </div>
      </div>
      
      <!-- 展开时的分组列表 -->
      <div v-if="showGroups" class="groups-list">
        <template v-for="group in topLevelGroups" :key="group.id">
          <!-- 分组文件夹 -->
          <template v-if="group.isFolder">
            <div
              class="group-folder-item"
              :class="{ 
                'expanded': expandedFolders.has(group.id),
                'drag-over-move-into': dragOverGroupId === group.id && dragOverGroupAction === 'move-into',
                'drag-over-sort': dragOverGroupId === group.id && dragOverGroupAction === 'sort',
                'dragging-group': draggedGroup === group.id
              }"
              draggable="true"
              @dragstart="onGroupDragStart(group.id, $event)"
              @dragover="onGroupDragOver(group.id, $event)"
              @dragleave="dragOverGroupId = null; dragOverGroupAction = null"
              @drop="onGroupDrop(group.id, $event)"
              @dragend="onGroupDragEnd"
            >
              <div class="folder-header" @click="toggleFolderExpand(group.id)">
                <span class="folder-icon">{{ expandedFolders.has(group.id) ? '📂' : '📁' }}</span>
                <template v-if="editingGroupId === group.id">
                  <input
                    v-model="editingName"
                    type="text"
                    class="edit-input"
                    @keyup.enter="saveGroupName(group)"
                    @blur="saveGroupName(group)"
                    @click.stop
                    autofocus
                  />
                </template>
                <template v-else>
                  <span class="group-name" @dblclick.stop="startEditGroup(group)">{{ group.name }}</span>
                </template>
                <button class="btn-add-subgroup" @click.stop="openAddSubGroup(group.id)" title="添加子分组">+</button>
                <button class="btn-delete-group" @click.stop="deleteGroup(group.id)">×</button>
              </div>
              
              <!-- 子分组列表 -->
              <div v-if="expandedFolders.has(group.id)" class="sub-groups-list">
                <div
                  v-for="subGroup in getChildGroups(group.id)"
                  :key="subGroup.id"
                  class="group-item sub-group"
                  :class="{ 
                    active: selectedGroupId === subGroup.id,
                    'drag-over-sort': dragOverGroupId === subGroup.id && dragOverGroupAction === 'sort',
                    'dragging-group': draggedGroup === subGroup.id
                  }"
                  draggable="true"
                  @click="selectedGroupId = subGroup.id"
                  @dragstart="onGroupDragStart(subGroup.id, $event)"
                  @dragover="onGroupDragOver(subGroup.id, $event)"
                  @dragleave="dragOverGroupId = null; dragOverGroupAction = null"
                  @drop="onGroupDrop(subGroup.id, $event)"
                  @dragend="onGroupDragEnd"
                >
                  <template v-if="editingGroupId === subGroup.id">
                    <input
                      v-model="editingName"
                      type="text"
                      class="edit-input"
                      @keyup.enter="saveGroupName(subGroup)"
                      @blur="saveGroupName(subGroup)"
                      @click.stop
                      autofocus
                    />
                  </template>
                  <template v-else>
                    <span class="group-name" @dblclick.stop="startEditGroup(subGroup)">{{ subGroup.name }}</span>
                    <span class="group-count">{{ collections.filter(c => c.groupId === subGroup.id).length }}</span>
                  </template>
                  <button class="btn-move-out" @click.stop="moveGroupToRoot(subGroup.id)" title="移出文件夹">↗</button>
                  <button class="btn-delete-group" @click.stop="deleteGroup(subGroup.id)">×</button>
                </div>
                <div v-if="getChildGroups(group.id).length === 0" class="empty-folder">
                  拖拽分组到此处或点击 + 添加
                </div>
              </div>
            </div>
          </template>
          
          <!-- 普通分组 -->
          <template v-else>
            <div
              class="group-item"
              :class="{ 
                active: selectedGroupId === group.id,
                'drag-over-sort': dragOverGroupId === group.id && dragOverGroupAction === 'sort',
                'dragging-group': draggedGroup === group.id
              }"
              draggable="true"
              @click="selectedGroupId = group.id"
              @dragstart="onGroupDragStart(group.id, $event)"
              @dragover="onGroupDragOver(group.id, $event)"
              @dragleave="dragOverGroupId = null; dragOverGroupAction = null"
              @drop="onGroupDrop(group.id, $event)"
              @dragend="onGroupDragEnd"
            >
              <template v-if="editingGroupId === group.id">
                <input
                  v-model="editingName"
                  type="text"
                  class="edit-input"
                  @keyup.enter="saveGroupName(group)"
                  @blur="saveGroupName(group)"
                  @click.stop
                  autofocus
                />
              </template>
              <template v-else>
                <span class="group-name" @dblclick.stop="startEditGroup(group)">{{ group.name }}</span>
                <span class="group-count">{{ collections.filter(c => c.groupId === group.id).length }}</span>
              </template>
              <button class="btn-delete-group" @click.stop="deleteGroup(group.id)">×</button>
            </div>
          </template>
        </template>
        
        <div v-if="topLevelGroups.length === 0" class="empty-groups">
          点击 + 创建分组
        </div>
      </div>
      
      <!-- 折叠时的分组图标列表 -->
      <div v-if="!showGroups" class="groups-list-collapsed">
        <template v-for="group in topLevelGroups" :key="group.id">
          <template v-if="group.isFolder">
            <div class="folder-icon-collapsed" :title="group.name + ' (文件夹)'">
              📁
            </div>
            <div
              v-for="subGroup in getChildGroups(group.id)"
              :key="subGroup.id"
              class="group-icon sub-group-icon"
              :class="{ active: selectedGroupId === subGroup.id }"
              :title="subGroup.name"
              @click="selectedGroupId = subGroup.id"
            >
              {{ subGroup.name.charAt(0).toUpperCase() }}
            </div>
          </template>
          <template v-else>
            <div
              class="group-icon"
              :class="{ active: selectedGroupId === group.id }"
              :title="group.name"
              @click="selectedGroupId = group.id"
            >
              {{ group.name.charAt(0).toUpperCase() }}
            </div>
          </template>
        </template>
        <button class="btn-add-group-collapsed" @click="openAddGroup" title="新建分组">+</button>
      </div>
    </aside>

    <!-- 新建集合弹窗 -->
    <Teleport to="body">
      <div v-if="showAddCollection" class="modal-overlay" @click.self="showAddCollection = false">
        <div class="modal" @click.stop>
          <h3>新建集合</h3>
          <input
            ref="newCollectionInput"
            v-model="newCollectionName"
            type="text"
            placeholder="集合名称"
            @keyup.enter="createCollection"
          />
          <div class="modal-actions">
            <button class="btn-secondary" @click="showAddCollection = false">取消</button>
            <button class="btn-primary" @click="createCollection">创建</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 新建分组弹窗 -->
    <Teleport to="body">
      <div v-if="showAddGroup" class="modal-overlay" @click.self="showAddGroup = false">
        <div class="modal" @click.stop>
          <h3>{{ newGroupIsFolder ? '新建分组文件夹' : (newGroupParentId ? '新建子分组' : '新建分组') }}</h3>
          <input
            ref="newGroupInput"
            v-model="newGroupName"
            type="text"
            :placeholder="newGroupIsFolder ? '文件夹名称' : '分组名称'"
            @keyup.enter="createGroup"
          />
          <div class="modal-actions">
            <button class="btn-secondary" @click="showAddGroup = false; newGroupParentId = null; newGroupIsFolder = false">取消</button>
            <button class="btn-primary" @click="createGroup">创建</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  min-height: 100vh;
  height: 100vh;
  overflow: hidden;
}

/* 侧边栏通用样式 */
.sidebar {
  background: linear-gradient(180deg, #1e1e2e 0%, #181825 100%);
  padding: 1rem;
  flex-shrink: 0;
  overflow-y: auto;
  overflow-x: hidden;
  height: 100vh;
  position: sticky;
  top: 0;
}

.left-sidebar {
  border-right: 1px solid rgba(147, 153, 178, 0.15);
}

.left-sidebar.collapsed {
  padding: 1rem 0.5rem;
}

.right-sidebar {
  border-left: 1px solid rgba(147, 153, 178, 0.15);
}

.right-sidebar.collapsed {
  padding: 1rem 0.5rem;
}

/* 拖拽调整宽度的手柄 */
.resize-handle {
  width: 4px;
  background: transparent;
  cursor: col-resize;
  flex-shrink: 0;
  transition: background 0.2s;
}

.resize-handle:hover {
  background: rgba(137, 180, 250, 0.4);
}

.resize-handle:active {
  background: rgba(137, 180, 250, 0.6);
}

.right-sidebar .sidebar-header {
  flex-direction: row;
}

.right-sidebar.collapsed .sidebar-header {
  justify-content: center;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid rgba(147, 153, 178, 0.15);
}

.sidebar-header h2 {
  font-size: 0.9rem;
  font-weight: 500;
  white-space: nowrap;
  color: #cdd6f4;
}

.btn-toggle {
  background: rgba(137, 180, 250, 0.1);
  border: none;
  color: #89b4fa;
  cursor: pointer;
  padding: 0.4rem 0.6rem;
  border-radius: 6px;
  transition: all 0.2s;
}

.btn-toggle:hover {
  background: rgba(137, 180, 250, 0.2);
}

.btn-add-group {
  background: rgba(166, 227, 161, 0.15);
  border: none;
  color: #a6e3a1;
  cursor: pointer;
  padding: 0.3rem 0.6rem;
  border-radius: 6px;
  font-size: 1rem;
  transition: all 0.2s;
}

.btn-add-group:hover {
  background: rgba(166, 227, 161, 0.25);
}

.header-buttons {
  display: flex;
  gap: 0.3rem;
}

.btn-add-folder {
  background: rgba(249, 226, 175, 0.15);
  border: none;
  color: #f9e2af;
  cursor: pointer;
  padding: 0.3rem 0.5rem;
  border-radius: 6px;
  font-size: 0.85rem;
  transition: all 0.2s;
}

.btn-add-folder:hover {
  background: rgba(249, 226, 175, 0.25);
}

/* 分组文件夹样式 */
.group-folder-item {
  margin-bottom: 0.5rem;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(249, 226, 175, 0.05) 0%, rgba(147, 153, 178, 0.05) 100%);
  border: 1px solid rgba(249, 226, 175, 0.15);
  transition: all 0.2s;
  overflow: hidden;
}

.group-folder-item.expanded {
  background: linear-gradient(135deg, rgba(249, 226, 175, 0.08) 0%, rgba(147, 153, 178, 0.06) 100%);
  border-color: rgba(249, 226, 175, 0.25);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.group-folder-item.drag-over-move-into {
  border-color: #a6e3a1;
  background: linear-gradient(135deg, rgba(166, 227, 161, 0.2) 0%, rgba(166, 227, 161, 0.1) 100%);
  box-shadow: 0 0 16px rgba(166, 227, 161, 0.3);
  transform: scale(1.02);
}

.group-folder-item.drag-over-sort {
  border-color: #89b4fa;
  border-top-width: 3px;
  background: linear-gradient(135deg, rgba(137, 180, 250, 0.1) 0%, rgba(249, 226, 175, 0.05) 100%);
}

.group-folder-item.dragging-group {
  opacity: 0.5;
}

.folder-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 0.6rem;
  cursor: pointer;
  border-radius: 9px;
  transition: all 0.2s;
}

.folder-header:hover {
  background: rgba(249, 226, 175, 0.1);
}

.folder-icon {
  font-size: 1.1rem;
  flex-shrink: 0;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
}

.folder-header .group-name {
  color: #f9e2af;
  font-weight: 500;
}

.btn-add-subgroup {
  background: rgba(137, 180, 250, 0.15);
  border: none;
  color: #89b4fa;
  cursor: pointer;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  font-size: 0.85rem;
  opacity: 0;
  transition: all 0.2s;
  margin-left: auto;
}

.folder-header:hover .btn-add-subgroup {
  opacity: 1;
}

.btn-add-subgroup:hover {
  background: rgba(137, 180, 250, 0.25);
}

.sub-groups-list {
  padding: 0.4rem 0.4rem 0.6rem 0.6rem;
  margin-top: 0.2rem;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 0 0 8px 8px;
  position: relative;
}

/* 左侧装饰线 */
.sub-groups-list::before {
  content: '';
  position: absolute;
  left: 0.9rem;
  top: 0.4rem;
  bottom: 0.6rem;
  width: 2px;
  background: linear-gradient(180deg, rgba(137, 180, 250, 0.4) 0%, rgba(137, 180, 250, 0.1) 100%);
  border-radius: 1px;
}

.sub-group {
  margin-left: 1rem;
  margin-bottom: 0.25rem;
  padding: 0.55rem 0.6rem;
  background: rgba(147, 153, 178, 0.06);
  border: 1px solid rgba(147, 153, 178, 0.1);
  border-radius: 6px;
  position: relative;
  transition: all 0.2s;
}

/* 连接线 */
.sub-group::before {
  content: '';
  position: absolute;
  left: -0.6rem;
  top: 50%;
  width: 0.5rem;
  height: 2px;
  background: rgba(137, 180, 250, 0.3);
}

.sub-group:hover {
  background: rgba(137, 180, 250, 0.1);
  border-color: rgba(137, 180, 250, 0.25);
}

.sub-group.active {
  background: rgba(137, 180, 250, 0.15);
  border-color: rgba(137, 180, 250, 0.4);
  box-shadow: 0 0 8px rgba(137, 180, 250, 0.15);
}

.sub-group.active::before {
  background: #89b4fa;
}

.sub-group.drag-over-group {
  border-color: #a6e3a1;
  background: rgba(166, 227, 161, 0.15);
}

.sub-group.dragging-group {
  opacity: 0.4;
}

.sub-group .group-name {
  font-size: 0.85rem;
}

.sub-group .group-count {
  font-size: 0.7rem;
  padding: 0.1rem 0.35rem;
}

.empty-folder {
  color: #6c7086;
  font-size: 0.75rem;
  text-align: center;
  padding: 1rem 0.5rem;
  font-style: italic;
  border: 1px dashed rgba(137, 180, 250, 0.2);
  border-radius: 6px;
  margin: 0.3rem 0 0 1rem;
  background: rgba(137, 180, 250, 0.03);
}

.btn-move-out {
  background: rgba(137, 180, 250, 0.1);
  border: none;
  color: #89b4fa;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0.15rem 0.35rem;
  border-radius: 4px;
  opacity: 0;
  transition: all 0.2s;
}

.group-item:hover .btn-move-out,
.sub-group:hover .btn-move-out {
  opacity: 1;
}

.btn-move-out:hover {
  background: rgba(137, 180, 250, 0.2);
  color: #b4befe;
}

.folder-icon-collapsed {
  width: 32px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  color: #f9e2af;
  opacity: 0.8;
  margin-top: 0.3rem;
}

.sub-group-icon {
  width: 26px;
  height: 26px;
  font-size: 0.7rem;
  margin-left: 6px;
  background: rgba(137, 180, 250, 0.1);
  border-left: 2px solid rgba(137, 180, 250, 0.4);
  border-radius: 0 5px 5px 0;
}

.sub-group-icon.active {
  background: rgba(137, 180, 250, 0.25);
  border-left-color: #89b4fa;
}

/* 左侧标签列表 */
.open-tabs-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.open-tab-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0.5rem;
  border-radius: 8px;
  background: rgba(147, 153, 178, 0.08);
  cursor: grab;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.open-tab-item:hover {
  background: rgba(137, 180, 250, 0.15);
  border-color: rgba(137, 180, 250, 0.3);
}

.open-tab-item:active {
  cursor: grabbing;
  background: rgba(137, 180, 250, 0.25);
  transform: scale(0.98);
}

.btn-refresh {
  margin-top: 0.8rem;
  padding: 0.6rem;
  background: rgba(166, 227, 161, 0.1);
  border: 1px solid rgba(166, 227, 161, 0.3);
  border-radius: 8px;
  color: #a6e3a1;
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.2s;
}

.btn-refresh:hover {
  background: rgba(166, 227, 161, 0.2);
  border-color: rgba(166, 227, 161, 0.5);
}

/* 右侧分组列表 */
.groups-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.group-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 0.6rem;
  border-radius: 8px;
  background: rgba(147, 153, 178, 0.08);
  cursor: grab;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.group-item:active {
  cursor: grabbing;
}

.group-item:hover {
  background: rgba(147, 153, 178, 0.15);
}

.group-item.active {
  background: rgba(137, 180, 250, 0.2);
  border-color: rgba(137, 180, 250, 0.4);
}

.group-item.dragging-group {
  opacity: 0.5;
  cursor: grabbing;
}

.group-item.drag-over-sort {
  border-color: #89b4fa;
  border-top: 3px solid #89b4fa;
  background: rgba(137, 180, 250, 0.15);
  box-shadow: 0 -2px 8px rgba(137, 180, 250, 0.2);
}

.sub-group.drag-over-sort {
  border-color: #89b4fa;
  border-top: 3px solid #89b4fa;
  background: rgba(137, 180, 250, 0.15);
}

.group-name {
  flex: 1;
  font-size: 0.9rem;
  color: #cdd6f4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-count {
  font-size: 0.75rem;
  color: #6c7086;
  background: rgba(147, 153, 178, 0.15);
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
}

.btn-delete-group {
  background: transparent;
  border: none;
  color: #6c7086;
  cursor: pointer;
  font-size: 1rem;
  padding: 0 0.2rem;
  opacity: 0;
  transition: all 0.2s;
}

.group-item:hover .btn-delete-group {
  opacity: 1;
}

.btn-delete-group:hover {
  color: #f38ba8;
}

/* 折叠时的分组图标列表 */
.groups-list-collapsed {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.group-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(147, 153, 178, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  font-weight: 500;
  color: #cdd6f4;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.group-icon:hover {
  background: rgba(137, 180, 250, 0.2);
}

.group-icon.active {
  background: rgba(137, 180, 250, 0.3);
  border-color: rgba(137, 180, 250, 0.5);
  color: #89b4fa;
}

.btn-add-group-collapsed {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(166, 227, 161, 0.15);
  border: 1px dashed rgba(166, 227, 161, 0.4);
  color: #a6e3a1;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.2s;
  margin-top: 0.5rem;
}

.btn-add-group-collapsed:hover {
  background: rgba(166, 227, 161, 0.25);
}

.empty-groups {
  color: #6c7086;
  font-size: 0.85rem;
  text-align: center;
  padding: 1.5rem 0.5rem;
}

/* 主内容区 */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 2rem;
  flex-shrink: 0;
  background: linear-gradient(180deg, rgba(30, 30, 46, 0.95) 0%, rgba(30, 30, 46, 0.8) 100%);
  border-bottom: 1px solid rgba(147, 153, 178, 0.1);
}

.collections-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem 2rem 2rem;
}

.header h1 {
  font-size: 1.5rem;
  font-weight: 600;
  color: #cdd6f4;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-icon-text {
  background: rgba(147, 153, 178, 0.1);
  border: 1px solid rgba(147, 153, 178, 0.2);
  color: #cdd6f4;
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.2s;
}

.btn-icon-text:hover {
  background: rgba(147, 153, 178, 0.2);
  border-color: rgba(147, 153, 178, 0.4);
}

.btn-primary {
  background: linear-gradient(135deg, #89b4fa 0%, #b4befe 100%);
  color: #1e1e2e;
  border: none;
  padding: 0.6rem 1.2rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(137, 180, 250, 0.3);
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(137, 180, 250, 0.4);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.btn-secondary {
  background: rgba(147, 153, 178, 0.1);
  color: #cdd6f4;
  border: 1px solid rgba(147, 153, 178, 0.3);
  padding: 0.6rem 1.2rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: rgba(147, 153, 178, 0.2);
  border-color: rgba(147, 153, 178, 0.5);
}

/* 集合网格 - 固定双列，瀑布流布局 */
.collections-grid {
  column-count: 2;
  column-gap: 1.5rem;
}

.collection-card {
  background: rgba(30, 30, 46, 0.6);
  border-radius: 12px;
  padding: 1rem;
  border: 2px dashed rgba(147, 153, 178, 0.25);
  transition: all 0.2s ease;
  min-height: 100px;
  margin-bottom: 1rem;
  break-inside: avoid;
  cursor: grab;
}

.collection-card:active {
  cursor: grabbing;
}

.collection-card:hover {
  border-color: rgba(137, 180, 250, 0.4);
  background: rgba(30, 30, 46, 0.8);
}

.collection-card.drag-over {
  border-color: #89b4fa;
  border-style: solid;
  background: rgba(137, 180, 250, 0.1);
  box-shadow: 0 0 24px rgba(137, 180, 250, 0.25);
}

.collection-card.dragging {
  opacity: 0.5;
  cursor: grabbing;
}

.collection-card.drag-over-sort {
  border-color: #a6e3a1;
  border-style: solid;
  background: rgba(166, 227, 161, 0.1);
  box-shadow: 0 0 24px rgba(166, 227, 161, 0.25);
}

/* 放大的集合卡片 - 占据两列宽度 */
.collection-card.expanded {
  column-span: all;
  background: rgba(30, 30, 46, 0.85);
  /* 使用 padding 包裹的方式确保与相邻卡片有足够间距 */
  padding-top: 1.2rem;
  padding-bottom: 1.2rem;
  margin-top: 0.5rem;
  margin-bottom: 1.5rem;
  /* 添加顶部边框增强视觉分隔 */
  border-top: 1px solid rgba(137, 180, 250, 0.2);
}

.collection-card.expanded .tabs-list {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
}

.collection-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.8rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid rgba(147, 153, 178, 0.15);
}

.collection-header h3 {
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  color: #cdd6f4;
}

.collection-actions {
  display: flex;
  gap: 0.3rem;
}

.btn-icon {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  padding: 0.3rem;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.btn-icon:hover {
  opacity: 1;
}

.edit-input {
  background: rgba(30, 30, 46, 0.8);
  border: 1px solid #89b4fa;
  border-radius: 6px;
  padding: 0.3rem 0.5rem;
  color: #cdd6f4;
  font-size: 0.9rem;
  width: 100%;
}

.edit-input:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(137, 180, 250, 0.2);
}

/* 标签列表 - 默认2列 */
.tabs-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.4rem;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  cursor: grab;
  transition: all 0.15s ease;
  border: 1px solid transparent;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.tab-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.tab-item:active {
  cursor: grabbing;
}

.tab-item.dragging-tab {
  opacity: 0.4;
}

.tab-item.drag-over-tab {
  border-color: #f9e2af;
  background: rgba(249, 226, 175, 0.15);
}

.tab-favicon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.tab-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.85rem;
  cursor: pointer;
  color: #cdd6f4;
  min-width: 0;
}

.tab-title:hover {
  color: #89b4fa;
}

.tab-edit-input {
  flex: 1;
  background: rgba(30, 30, 46, 0.9);
  border: 1px solid #89b4fa;
  border-radius: 4px;
  padding: 0.2rem 0.4rem;
  color: #cdd6f4;
  font-size: 0.85rem;
  min-width: 0;
}

.tab-edit-input:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(137, 180, 250, 0.2);
}

.tab-actions {
  display: flex;
  gap: 0.2rem;
  opacity: 0;
  transition: opacity 0.2s;
  flex-shrink: 0;
}

.tab-item:hover .tab-actions {
  opacity: 1;
}

.btn-edit-tab {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0.1rem 0.2rem;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.btn-edit-tab:hover {
  opacity: 1;
}

.btn-delete {
  background: transparent;
  border: none;
  color: #6c7086;
  cursor: pointer;
  font-size: 1rem;
  padding: 0 0.2rem;
  transition: color 0.2s;
}

.btn-delete:hover {
  color: #f38ba8;
}

.empty-hint {
  color: #6c7086;
  font-size: 0.85rem;
  text-align: center;
  padding: 2rem 1rem;
  border: 1px dashed rgba(147, 153, 178, 0.2);
  border-radius: 8px;
  margin-top: 0.5rem;
}

.empty-state {
  column-span: all;
  text-align: center;
  padding: 4rem 2rem;
  color: #6c7086;
}

.empty-state p {
  margin: 0.5rem 0;
}

/* 弹窗 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(17, 17, 27, 0.85);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.modal {
  background: linear-gradient(145deg, #1e1e2e 0%, #181825 100%);
  padding: 1.8rem;
  border-radius: 16px;
  min-width: 340px;
  border: 1px solid rgba(147, 153, 178, 0.15);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
}

.modal h3 {
  margin-bottom: 1.2rem;
  color: #cdd6f4;
  font-size: 1.1rem;
}

.modal input {
  width: 100%;
  padding: 0.8rem 1rem;
  border: 1px solid rgba(147, 153, 178, 0.2);
  border-radius: 8px;
  background: rgba(30, 30, 46, 0.8);
  color: #cdd6f4;
  margin-bottom: 1.2rem;
  font-size: 0.95rem;
  transition: all 0.2s;
}

.modal input:focus {
  outline: none;
  border-color: #89b4fa;
  box-shadow: 0 0 0 3px rgba(137, 180, 250, 0.2);
}

.modal input::placeholder {
  color: #6c7086;
}

.modal-actions {
  display: flex;
  gap: 0.8rem;
  justify-content: flex-end;
}
</style>
