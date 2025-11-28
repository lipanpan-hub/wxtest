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
}

export interface Group {
  id: string;
  name: string;
  createdAt: number;
}

export interface AppState {
  groups: Group[];
  collections: Collection[];
}
