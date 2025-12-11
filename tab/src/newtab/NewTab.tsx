/**
 * NewTab 主组件
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { Plus, Edit, FolderPlus } from 'lucide-react';
import { useNewtabStore } from './hooks/useNewtabStore';
import { Clock } from './components/Clock';
import { SearchBar } from './components/SearchBar';
import { ShortcutGrid } from './components/ShortcutGrid';
import { Wallpaper } from './components/Wallpaper';
import { DockBar } from './components/DockBar';
import { Greeting } from './components/Greeting';
import { LunarDate } from './components/LunarDate';
import { Poetry } from './components/Poetry';
import { GroupSidebar } from './components/GroupSidebar';
import { SettingsPanel } from './components/SettingsPanel';
import { AddShortcutModal } from './components/AddShortcutModal';
import { AddFolderModal } from './components/AddFolderModal';
import { BatchEditModal } from './components/BatchEditModal';
import { ShortcutContextMenu } from './components/ShortcutContextMenu';
import { FAVICON_API } from './constants';

export function NewTab() {
  const { settings, isLoading, loadData, updateSettings, shortcutGroups, activeGroupId, setActiveGroup, addShortcut, addFolder } = useNewtabStore();
  const [showSettings, setShowSettings] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddFolderModal, setShowAddFolderModal] = useState(false);
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const wheelTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isWheelLocked = useRef(false);
  
  // 使用 ref 存储最新的状态，避免 handleWheel 频繁重建
  const stateRef = useRef({ shortcutGroups, activeGroupId, setActiveGroup });
  stateRef.current = { shortcutGroups, activeGroupId, setActiveGroup };

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 滚轮切换分组 - 使用稳定的回调，通过 ref 访问最新状态
  const handleWheel = useCallback((e: WheelEvent) => {
    const { shortcutGroups: groups, activeGroupId: currentGroupId, setActiveGroup: setGroup } = stateRef.current;
    
    // 如果正在锁定中，忽略滚轮事件
    if (isWheelLocked.current) {
      return;
    }
    
    // 检查是否在可滚动元素内
    const target = e.target as HTMLElement;
    const scrollableParent = target.closest('.overflow-y-auto, .overflow-auto');
    if (scrollableParent) {
      const { scrollTop, scrollHeight, clientHeight } = scrollableParent;
      // 如果内容可滚动且不在边界，不切换分组
      if (scrollHeight > clientHeight) {
        if (e.deltaY < 0 && scrollTop > 0) return;
        if (e.deltaY > 0 && scrollTop + clientHeight < scrollHeight) return;
      }
    }

    // 构建分组列表：所有分组的 ID
    const groupIds = groups.map(g => g.id);
    if (groupIds.length === 0) return;
    
    const currentIndex = groupIds.indexOf(currentGroupId || '');
    
    // 如果当前没有选中分组或找不到当前分组，默认为第一个
    if (currentIndex === -1) {
      setGroup(groupIds[0]);
      return;
    }
    
    let newIndex = currentIndex;
    if (e.deltaY > 0) {
      // 向下滚动，切换到下一个分组
      newIndex = Math.min(currentIndex + 1, groupIds.length - 1);
    } else if (e.deltaY < 0) {
      // 向上滚动，切换到上一个分组
      newIndex = Math.max(currentIndex - 1, 0);
    }

    if (newIndex !== currentIndex) {
      e.preventDefault(); // 阻止默认滚动行为
      setGroup(groupIds[newIndex]);
      // 锁定一段时间，防止连续切换
      isWheelLocked.current = true;
      if (wheelTimeoutRef.current) {
        clearTimeout(wheelTimeoutRef.current);
      }
      wheelTimeoutRef.current = setTimeout(() => {
        isWheelLocked.current = false;
      }, 300);
    }
  }, []); // 空依赖数组，handleWheel 永远不会重建

  // 右键菜单处理
  const handleContextMenu = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    // 排除设置面板、弹窗等区域
    const isInModal = target.closest('[role="dialog"]') || target.closest('.glass-modal') || target.closest('.glass-modal-dark');
    // 排除输入框
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
    
    if (!isInModal && !isInput) {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY });
    }
  }, []);

  // 监听滚轮事件
  useEffect(() => {
    if (!settings.showShortcuts) return;
    
    // 移除 passive: true，允许阻止默认行为
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', handleWheel);
      if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
    };
  }, [handleWheel, settings.showShortcuts]);

  // 监听右键菜单事件
  useEffect(() => {
    window.addEventListener('contextmenu', handleContextMenu);
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [handleContextMenu]);

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#1a1a2e]">
        <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* 壁纸背景 */}
      <Wallpaper config={settings.wallpaper} />



      {/* 主内容 - 参考 mtab 布局，内容偏上 */}
      <div className="relative z-10 w-full h-full flex flex-col items-center px-4 pt-[12vh] pb-8 overflow-y-auto">
        {/* 问候语 */}
        {settings.showGreeting && (
          <div className="mb-1 animate-fadeIn">
            <Greeting userName={settings.userName} />
          </div>
        )}

        {/* 时钟（包含日期和农历） */}
        {settings.showClock && (
          <div className="mb-3 animate-fadeIn">
            <Clock
              format={settings.clockFormat}
              showDate={settings.showDate}
              showSeconds={settings.showSeconds}
              showLunar={settings.showLunar}
            />
          </div>
        )}

        {/* 独立农历显示（仅当时钟关闭但农历开启时） */}
        {!settings.showClock && settings.showLunar && (
          <div className="mb-3 animate-fadeIn">
            <LunarDate />
          </div>
        )}

        {/* 每日诗词 */}
        {settings.showPoetry && (
          <div className="mb-6 animate-fadeIn">
            <Poetry />
          </div>
        )}

        {/* 搜索框 - 提高层级确保下拉框不被遮挡 */}
        {settings.showSearch && (
          <div className="w-full max-w-2xl mb-6 animate-fadeIn px-4 relative z-50">
            <SearchBar
              engine={settings.searchEngine}
              enableSuggestions={settings.enableSearchSuggestions}
              onEngineChange={(engine) => updateSettings({ searchEngine: engine })}
            />
          </div>
        )}

        {/* 快捷方式网格 + 添加按钮 */}
        {settings.showShortcuts && (
          <div className="w-full max-w-5xl animate-fadeIn px-4 shortcut-area">
            <div className="flex items-start gap-4">
              <ShortcutGrid 
                columns={settings.shortcutColumns} 
                style={settings.shortcutStyle}
                onAddClick={() => setShowAddModal(true)}
                onBatchEditClick={() => setShowBatchEdit(true)}
              />
            </div>
          </div>
        )}

      </div>

      {/* 左侧分组侧边栏 */}
      <GroupSidebar onOpenSettings={() => setShowSettings(true)} />

      {/* 底部 Dock 栏 - 置顶书签 */}
      {settings.showPinnedBookmarks && <DockBar />}

      {/* 设置面板 - 在顶层渲染避免被父容器限制 */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {/* 添加快捷方式弹窗 */}
      {showAddModal && (
        <AddShortcutModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onAdd={(url, title) => {
            const domain = new URL(url).hostname;
            addShortcut({
              url,
              title,
              favicon: `${FAVICON_API}${domain}&sz=64`,
              groupId: activeGroupId || undefined,
            });
          }}
          groupName={
            activeGroupId
              ? shortcutGroups.find((g) => g.id === activeGroupId)?.name
              : undefined
          }
        />
      )}

      {/* 批量编辑弹窗 */}
      <BatchEditModal
        isOpen={showBatchEdit}
        onClose={() => setShowBatchEdit(false)}
      />

      {/* 添加文件夹弹窗 */}
      <AddFolderModal
        isOpen={showAddFolderModal}
        onClose={() => setShowAddFolderModal(false)}
        onSave={(name) => addFolder(name, activeGroupId ?? undefined)}
      />

      {/* 右键菜单 */}
      {contextMenu && (
        <ShortcutContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            {
              label: '添加快捷方式',
              icon: <Plus className="w-4 h-4" />,
              onClick: () => setShowAddModal(true),
            },
            {
              label: '添加文件夹',
              icon: <FolderPlus className="w-4 h-4" />,
              onClick: () => setShowAddFolderModal(true),
            },
            {
              label: '批量编辑',
              icon: <Edit className="w-4 h-4" />,
              onClick: () => setShowBatchEdit(true),
              divider: true,
            },
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
