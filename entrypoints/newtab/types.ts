export interface TabItem {
  id: string;
  title: string;
  url: string;
  favicon: string;
}

export interface Collection {
  id: string;
  name: string;
  tabs: TabItem[];
  createdAt: number;
  groupId: string; // 所属分组ID
  expanded?: boolean; // 是否放大显示
}

export interface Group {
  id: string;
  name: string;
  createdAt: number;
  isFolder: boolean;      // 是否是分组文件夹（包含子分组）
  parentId: string | null; // 父分组文件夹ID，null 表示顶级
}

export interface AppState {
  groups: Group[];
  collections: Collection[];
}
