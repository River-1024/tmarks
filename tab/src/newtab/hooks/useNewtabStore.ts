/**
 * NewTab 状态管理
 */

import { create } from 'zustand';
import type { Shortcut, ShortcutGroup, ShortcutFolder, NewTabSettings, NewTabStorage, GridItem, GridItemType, GridItemSize } from '../types';
import { DEFAULT_SETTINGS, STORAGE_KEY, DEFAULT_GROUPS } from '../constants';
import { StorageService } from '@/lib/utils/storage';
import { getTMarksUrls } from '@/lib/constants/urls';
import { getWidgetMeta, getDefaultWidgetConfig } from '../components/widgets/widgetRegistry';

// 同步 NewTab 数据到后端（静默执行，不阻塞 UI）
async function syncNewtabToBackend(data: {
  shortcuts: Shortcut[];
  groups: ShortcutGroup[];
  folders: ShortcutFolder[];
  settings: NewTabSettings;
  gridItems: GridItem[];
}) {
  try {
    const configuredUrl = await StorageService.getBookmarkSiteApiUrl();
    const apiKey = await StorageService.getBookmarkSiteApiKey();

    if (!apiKey) {
      console.log('[NewTab Sync] 未配置 API Key，跳过同步');
      return;
    }

    const baseUrl = configuredUrl?.endsWith('/api')
      ? configuredUrl
      : getTMarksUrls(configuredUrl || undefined).API_BASE;

    const response = await fetch(`${baseUrl}/tab/newtab/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        shortcuts: data.shortcuts.map((s) => ({
          id: s.id,
          title: s.title,
          url: s.url,
          favicon: s.favicon,
          group_id: s.groupId,
          folder_id: s.folderId,
          position: s.position,
        })),
        groups: data.groups.map((g) => ({
          id: g.id,
          name: g.name,
          icon: g.icon,
          position: g.position,
        })),
        folders: data.folders.map((f) => ({
          id: f.id,
          name: f.name,
          icon: f.icon,
          group_id: f.groupId,
          position: f.position,
        })),
        settings: {
          columns: data.settings.shortcutColumns,
          style: data.settings.shortcutStyle,
          showTitle: true,
          backgroundType: data.settings.wallpaper.type,
          backgroundValue: data.settings.wallpaper.value,
          backgroundBlur: data.settings.wallpaper.blur,
          backgroundDim: data.settings.wallpaper.brightness,
          showSearch: data.settings.showSearch,
          showClock: data.settings.showClock,
          showPinnedBookmarks: data.settings.showPinnedBookmarks,
          searchEngine: data.settings.searchEngine,
        },
        gridItems: data.gridItems.map((item) => ({
          id: item.id,
          type: item.type,
          size: item.size,
          position: item.position,
          group_id: item.groupId,
          shortcut: item.shortcut,
          config: item.config,
        })),
      }),
    });

    if (response.ok) {
      console.log('[NewTab Sync] 数据已同步到后端');
    } else {
      console.warn('[NewTab Sync] 同步失败:', response.status);
    }
  } catch (error) {
    // 静默失败，不影响本地操作
    console.warn('[NewTab Sync] 同步失败:', error);
  }
}

// 防抖同步（避免频繁请求）
let syncTimeout: ReturnType<typeof setTimeout> | null = null;
function debouncedSync(data: {
  shortcuts: Shortcut[];
  groups: ShortcutGroup[];
  folders: ShortcutFolder[];
  settings: NewTabSettings;
  gridItems: GridItem[];
}) {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }
  syncTimeout = setTimeout(() => {
    syncNewtabToBackend(data);
  }, 2000); // 2秒防抖
}

interface NewTabState {
  // 数据
  shortcuts: Shortcut[];
  shortcutGroups: ShortcutGroup[];
  shortcutFolders: ShortcutFolder[];
  activeGroupId: string | null;
  settings: NewTabSettings;
  isLoading: boolean;
  gridItems: GridItem[];
  
  // Actions
  loadData: () => Promise<void>;
  saveData: () => Promise<void>;
  
  // 快捷方式操作
  addShortcut: (shortcut: Omit<Shortcut, 'id' | 'position' | 'createdAt' | 'clickCount'>) => void;
  updateShortcut: (id: string, updates: Partial<Shortcut>) => void;
  removeShortcut: (id: string) => void;
  reorderShortcuts: (fromIndex: number, toIndex: number) => void;
  incrementClickCount: (id: string) => void;
  
  // 分组操作
  setActiveGroup: (groupId: string | null) => void;
  addGroup: (name: string, icon: string) => void;
  updateGroup: (id: string, updates: Partial<ShortcutGroup>) => void;
  removeGroup: (id: string) => void;
  getFilteredShortcuts: () => Shortcut[];
  
  // 文件夹操作
  addFolder: (name: string, groupId?: string) => string;
  updateFolder: (id: string, updates: Partial<ShortcutFolder>) => void;
  removeFolder: (id: string) => void;
  getFolderShortcuts: (folderId: string) => Shortcut[];
  moveShortcutToFolder: (shortcutId: string, folderId: string | undefined) => void;
  
  // 设置操作
  updateSettings: (updates: Partial<NewTabSettings>) => void;

  // 网格项操作
  addGridItem: (type: GridItemType, options?: { size?: GridItemSize; groupId?: string; shortcut?: GridItem['shortcut'] }) => void;
  updateGridItem: (id: string, updates: Partial<GridItem>) => void;
  removeGridItem: (id: string) => void;
  reorderGridItems: (fromIndex: number, toIndex: number) => void;
  getFilteredGridItems: () => GridItem[];
  migrateToGridItems: () => void;
}

// 生成唯一 ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const useNewtabStore = create<NewTabState>((set, get) => ({
  shortcuts: [],
  shortcutGroups: DEFAULT_GROUPS,
  shortcutFolders: [],
  activeGroupId: 'home', // 默认选中首页
  settings: DEFAULT_SETTINGS,
  isLoading: true,
  gridItems: [],
  
  loadData: async () => {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const data = result[STORAGE_KEY] as NewTabStorage | undefined;
      
      // 确保分组数据有效
      const groups = data?.shortcutGroups?.length ? data.shortcutGroups : DEFAULT_GROUPS;
      
      // 验证 activeGroupId 是否有效，如果无效则使用第一个分组
      let activeGroupId = data?.activeGroupId;
      if (!activeGroupId || !groups.some(g => g.id === activeGroupId)) {
        activeGroupId = groups[0]?.id || 'home';
      }
      
      // 合并设置，确保新增的设置项有默认值
      const settings = { ...DEFAULT_SETTINGS, ...(data?.settings || {}) };
      
      set({
        shortcuts: data?.shortcuts || [],
        shortcutGroups: groups,
        shortcutFolders: data?.shortcutFolders || [],
        activeGroupId,
        settings,
        gridItems: data?.gridItems || [],
        isLoading: false,
      });
      
      // 如果是首次加载（没有数据），保存默认数据
      if (!data) {
        const { saveData } = get();
        saveData();
      }
    } catch (error) {
      console.error('Failed to load newtab data:', error);
      set({ isLoading: false });
    }
  },
  
  saveData: async () => {
    const { shortcuts, shortcutGroups, shortcutFolders, activeGroupId, settings, gridItems } = get();
    const data: NewTabStorage = { shortcuts, shortcutGroups, shortcutFolders, activeGroupId, settings, gridItems };
    
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: data });
    } catch (error) {
      console.error('Failed to save newtab data:', error);
    }
  },
  
  addShortcut: (shortcut) => {
    const { shortcuts, shortcutGroups, settings, gridItems, saveData } = get();
    const newShortcut: Shortcut = {
      ...shortcut,
      id: generateId(),
      position: shortcuts.length,
      createdAt: Date.now(),
      clickCount: 0,
    };

    const newShortcuts = [...shortcuts, newShortcut];
    set({ shortcuts: newShortcuts });
    saveData();

    // 异步同步到后端（防抖）
    const { shortcutFolders } = get();
    debouncedSync({ shortcuts: newShortcuts, groups: shortcutGroups, folders: shortcutFolders, settings, gridItems });
  },
  
  updateShortcut: (id, updates) => {
    const { shortcuts, shortcutGroups, shortcutFolders, settings, gridItems, saveData } = get();
    const newShortcuts = shortcuts.map((s) => (s.id === id ? { ...s, ...updates } : s));
    set({ shortcuts: newShortcuts });
    saveData();
    debouncedSync({ shortcuts: newShortcuts, groups: shortcutGroups, folders: shortcutFolders, settings, gridItems });
  },

  removeShortcut: (id) => {
    const { shortcuts, shortcutGroups, shortcutFolders, settings, gridItems, saveData } = get();
    const filtered = shortcuts.filter((s) => s.id !== id);
    const reordered = filtered.map((s, index) => ({ ...s, position: index }));
    set({ shortcuts: reordered });
    saveData();
    debouncedSync({ shortcuts: reordered, groups: shortcutGroups, folders: shortcutFolders, settings, gridItems });
  },

  reorderShortcuts: (fromIndex, toIndex) => {
    const { shortcuts, shortcutGroups, shortcutFolders, settings, gridItems, saveData } = get();
    const newShortcuts = [...shortcuts];
    const [removed] = newShortcuts.splice(fromIndex, 1);
    newShortcuts.splice(toIndex, 0, removed);
    const reordered = newShortcuts.map((s, index) => ({ ...s, position: index }));
    set({ shortcuts: reordered });
    saveData();
    debouncedSync({ shortcuts: reordered, groups: shortcutGroups, folders: shortcutFolders, settings, gridItems });
  },
  
  incrementClickCount: (id) => {
    const { shortcuts, saveData } = get();
    set({
      shortcuts: shortcuts.map((s) =>
        s.id === id ? { ...s, clickCount: s.clickCount + 1 } : s
      ),
    });
    saveData();
  },
  
  updateSettings: (updates) => {
    const { shortcuts, shortcutGroups, shortcutFolders, settings, gridItems, saveData } = get();
    const newSettings = { ...settings, ...updates };
    set({ settings: newSettings });
    saveData();
    debouncedSync({ shortcuts, groups: shortcutGroups, folders: shortcutFolders, settings: newSettings, gridItems });
  },

  // 分组操作
  setActiveGroup: (groupId) => {
    const { saveData } = get();
    set({ activeGroupId: groupId });
    saveData();
    // 不需要同步 activeGroupId，这是本地状态
  },

  addGroup: (name, icon) => {
    const { shortcuts, shortcutGroups, shortcutFolders, settings, gridItems, saveData } = get();
    const newGroup: ShortcutGroup = {
      id: generateId(),
      name,
      icon,
      position: shortcutGroups.length,
    };
    const newGroups = [...shortcutGroups, newGroup];
    set({ shortcutGroups: newGroups });
    saveData();
    debouncedSync({ shortcuts, groups: newGroups, folders: shortcutFolders, settings, gridItems });
  },

  updateGroup: (id, updates) => {
    const { shortcuts, shortcutGroups, shortcutFolders, settings, gridItems, saveData } = get();
    const newGroups = shortcutGroups.map((g) => (g.id === id ? { ...g, ...updates } : g));
    set({ shortcutGroups: newGroups });
    saveData();
    debouncedSync({ shortcuts, groups: newGroups, folders: shortcutFolders, settings, gridItems });
  },

  removeGroup: (id) => {
    const { shortcutGroups, shortcutFolders, shortcuts, activeGroupId, settings, gridItems, saveData } = get();
    // 不允许删除首页分组
    if (id === 'home') {
      console.warn('不能删除首页分组');
      return;
    }
    // 删除分组时，将该分组的快捷方式移到首页
    const updatedShortcuts = shortcuts.map((s) =>
      s.groupId === id ? { ...s, groupId: 'home' } : s
    );
    const filtered = shortcutGroups.filter((g) => g.id !== id);
    set({
      shortcutGroups: filtered,
      shortcuts: updatedShortcuts,
      activeGroupId: activeGroupId === id ? 'home' : activeGroupId,
    });
    saveData();
    debouncedSync({ shortcuts: updatedShortcuts, groups: filtered, folders: shortcutFolders, settings, gridItems });
  },
  
  getFilteredShortcuts: () => {
    const { shortcuts, activeGroupId } = get();
    // 如果没有选中分组，默认显示首页分组
    const targetGroupId = activeGroupId ?? 'home';
    // 只返回不在文件夹内的快捷方式
    return shortcuts.filter((s) => s.groupId === targetGroupId && !s.folderId);
  },

  // 文件夹操作
  addFolder: (name, groupId) => {
    const { shortcuts, shortcutGroups, shortcutFolders, activeGroupId, settings, gridItems, saveData } = get();
    const newFolder: ShortcutFolder = {
      id: generateId(),
      name,
      position: shortcutFolders.length,
      groupId: groupId ?? activeGroupId ?? undefined,
      createdAt: Date.now(),
    };
    const newFolders = [...shortcutFolders, newFolder];
    set({ shortcutFolders: newFolders });
    saveData();
    debouncedSync({ shortcuts, groups: shortcutGroups, folders: newFolders, settings, gridItems });
    return newFolder.id;
  },

  updateFolder: (id, updates) => {
    const { shortcuts, shortcutGroups, shortcutFolders, settings, gridItems, saveData } = get();
    const newFolders = shortcutFolders.map((f) => (f.id === id ? { ...f, ...updates } : f));
    set({ shortcutFolders: newFolders });
    saveData();
    debouncedSync({ shortcuts, groups: shortcutGroups, folders: newFolders, settings, gridItems });
  },

  removeFolder: (id) => {
    const { shortcuts, shortcutGroups, shortcutFolders, settings, gridItems, saveData } = get();
    // 删除文件夹时，将文件夹内的快捷方式移出
    const updatedShortcuts = shortcuts.map((s) =>
      s.folderId === id ? { ...s, folderId: undefined } : s
    );
    const filtered = shortcutFolders.filter((f) => f.id !== id);
    set({ shortcutFolders: filtered, shortcuts: updatedShortcuts });
    saveData();
    debouncedSync({ shortcuts: updatedShortcuts, groups: shortcutGroups, folders: filtered, settings, gridItems });
  },

  getFolderShortcuts: (folderId) => {
    const { shortcuts } = get();
    return shortcuts.filter((s) => s.folderId === folderId);
  },

  moveShortcutToFolder: (shortcutId, folderId) => {
    const { shortcuts, shortcutGroups, shortcutFolders, settings, gridItems, saveData } = get();
    const newShortcuts = shortcuts.map((s) =>
      s.id === shortcutId ? { ...s, folderId } : s
    );
    set({ shortcuts: newShortcuts });
    saveData();
    debouncedSync({ shortcuts: newShortcuts, groups: shortcutGroups, folders: shortcutFolders, settings, gridItems });
  },

  // 网格项操作
  addGridItem: (type, options = {}) => {
    const { shortcuts, shortcutGroups, shortcutFolders, settings, gridItems, activeGroupId, saveData } = get();
    const meta = getWidgetMeta(type);
    const defaultConfig = getDefaultWidgetConfig(type);
    
    const newItem: GridItem = {
      id: generateId(),
      type,
      size: options.size || meta.sizeConfig.defaultSize,
      position: gridItems.length,
      groupId: options.groupId ?? activeGroupId ?? undefined,
      shortcut: options.shortcut,
      config: type !== 'shortcut' ? defaultConfig : undefined,
      createdAt: Date.now(),
    };

    const newGridItems = [...gridItems, newItem];
    set({ gridItems: newGridItems });
    saveData();
    debouncedSync({ shortcuts, groups: shortcutGroups, folders: shortcutFolders, settings, gridItems: newGridItems });
  },

  updateGridItem: (id, updates) => {
    const { shortcuts, shortcutGroups, shortcutFolders, settings, gridItems, saveData } = get();
    const newGridItems = gridItems.map((item) =>
      item.id === id ? { ...item, ...updates } : item
    );
    set({ gridItems: newGridItems });
    saveData();
    debouncedSync({ shortcuts, groups: shortcutGroups, folders: shortcutFolders, settings, gridItems: newGridItems });
  },

  removeGridItem: (id) => {
    const { shortcuts, shortcutGroups, shortcutFolders, settings, gridItems, saveData } = get();
    const filtered = gridItems.filter((item) => item.id !== id);
    const reordered = filtered.map((item, index) => ({ ...item, position: index }));
    set({ gridItems: reordered });
    saveData();
    debouncedSync({ shortcuts, groups: shortcutGroups, folders: shortcutFolders, settings, gridItems: reordered });
  },

  reorderGridItems: (fromIndex, toIndex) => {
    const { shortcuts, shortcutGroups, shortcutFolders, settings, gridItems, saveData } = get();
    const newGridItems = [...gridItems];
    const [removed] = newGridItems.splice(fromIndex, 1);
    newGridItems.splice(toIndex, 0, removed);
    const reordered = newGridItems.map((item, index) => ({ ...item, position: index }));
    set({ gridItems: reordered });
    saveData();
    debouncedSync({ shortcuts, groups: shortcutGroups, folders: shortcutFolders, settings, gridItems: reordered });
  },

  getFilteredGridItems: () => {
    const { gridItems, activeGroupId } = get();
    // 如果没有选中分组，默认显示首页分组
    const targetGroupId = activeGroupId ?? 'home';
    return gridItems.filter((item) => item.groupId === targetGroupId);
  },

  // 数据迁移：将旧的 shortcuts 迁移到 gridItems
  migrateToGridItems: () => {
    const { shortcuts, gridItems, saveData } = get();
    
    // 如果没有 shortcuts，不需要迁移
    if (shortcuts.length === 0) return;

    // 找出尚未迁移的快捷方式
    const existingShortcutIds = new Set(
      gridItems
        .filter(item => item.type === 'shortcut' && item.shortcut)
        .map(item => item.id)
    );

    const newShortcuts = shortcuts.filter(s => !existingShortcutIds.has(s.id));
    
    if (newShortcuts.length === 0) return;

    // 迁移新的快捷方式
    const migratedItems: GridItem[] = newShortcuts.map((shortcut, index) => ({
      id: shortcut.id,
      type: 'shortcut' as GridItemType,
      size: '1x1' as GridItemSize,
      position: gridItems.length + index,
      groupId: shortcut.groupId,
      shortcut: {
        url: shortcut.url,
        title: shortcut.title,
        favicon: shortcut.favicon,
      },
      createdAt: shortcut.createdAt,
    }));

    const newGridItems = [...gridItems, ...migratedItems];
    set({ gridItems: newGridItems });
    saveData();
    console.log('[NewTab] 已迁移', migratedItems.length, '个快捷方式到网格系统');
  },



  // 清空所有网格项
}));
