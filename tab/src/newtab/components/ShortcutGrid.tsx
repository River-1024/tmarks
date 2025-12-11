/**
 * 快捷方式网格组件 - 支持拖拽排序、合并创建文件夹、分页滚动
 * 参考 iTabs 实现
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Link, FolderPlus } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { useNewtabStore } from '../hooks/useNewtabStore';
import { SortableShortcutItem } from './SortableShortcutItem';
import { ShortcutFolderItem } from './ShortcutFolderItem';
import { FolderModal } from './FolderModal';
import { AddFolderModal } from './AddFolderModal';
import { AddShortcutModal } from './AddShortcutModal';
import { DragOverlayItem } from './DragOverlayItem';
import { FAVICON_API } from '../constants';
import type { Shortcut, ShortcutFolder } from '../types';

interface ShortcutGridProps {
  columns: 6 | 8 | 10;
  style: 'icon' | 'card';
  onAddClick?: () => void;
  onBatchEditClick?: () => void;
}

// 合并项类型
type GridItemType = (Shortcut | ShortcutFolder) & { itemType: 'shortcut' | 'folder' };

export function ShortcutGrid({ columns, style, onAddClick, onBatchEditClick }: ShortcutGridProps) {
  const { 
    shortcuts, 
    reorderShortcuts, 
    getFilteredShortcuts,
    shortcutFolders,
    activeGroupId,
    getFolderShortcuts,
    addFolder,
    updateFolder,
    removeFolder,
    addShortcut,
    moveShortcutToFolder,
  } = useNewtabStore();
  
  // 状态
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [showAddFolderModal, setShowAddFolderModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<ShortcutFolder | null>(null);
  const [showAddToFolderModal, setShowAddToFolderModal] = useState(false);
  
  // 拖拽状态
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const mergeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOverIdRef = useRef<string | null>(null);

  // 分页状态
  const [currentPage, setCurrentPage] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const accumulatedRef = useRef(0);
  const lastTimeRef = useRef(0);
  const isChangingRef = useRef(false);

  // 获取当前分组的快捷方式（不在文件夹内的）
  const filteredShortcuts = getFilteredShortcuts();
  
  // 获取当前分组的文件夹
  const filteredFolders = shortcutFolders.filter(
    (f) => f.groupId === (activeGroupId ?? 'home')
  );
  
  // 当前打开的文件夹
  const openFolder = openFolderId 
    ? shortcutFolders.find(f => f.id === openFolderId) 
    : null;
  const openFolderShortcuts = openFolderId 
    ? getFolderShortcuts(openFolderId) 
    : [];

  // 合并所有项目用于排序
  const allItems: GridItemType[] = [
    ...filteredFolders.map(f => ({ ...f, itemType: 'folder' as const })),
    ...filteredShortcuts.map(s => ({ ...s, itemType: 'shortcut' as const })),
  ];

  // 分页计算
  const rows = 3;
  const itemsPerPage = columns * rows;
  const totalPages = Math.ceil(allItems.length / itemsPerPage);

  // 获取所有页面
  const pages = [];
  for (let i = 0; i < Math.max(1, totalPages); i++) {
    const start = i * itemsPerPage;
    pages.push(allItems.slice(start, start + itemsPerPage));
  }

  // 传感器配置
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 10 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 自定义碰撞检测
  const collisionDetection = useCallback(
    (args: Parameters<typeof closestCenter>[0]) => {
      const overlapCollisions = rectIntersection(args);
      if (overlapCollisions.length > 0) {
        return overlapCollisions;
      }
      return closestCenter(args);
    }, 
    []
  );

  // 响应式网格列数
  const gridCols = {
    6: 'grid-cols-4 sm:grid-cols-6',
    8: 'grid-cols-4 sm:grid-cols-6 md:grid-cols-8',
    10: 'grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10',
  };

  // 拖拽开始
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  // 拖拽悬停
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) {
      if (mergeTimerRef.current) {
        clearTimeout(mergeTimerRef.current);
        mergeTimerRef.current = null;
      }
      setMergeTargetId(null);
      lastOverIdRef.current = null;
      return;
    }

    if (lastOverIdRef.current !== over.id) {
      lastOverIdRef.current = over.id as string;
      
      if (mergeTimerRef.current) {
        clearTimeout(mergeTimerRef.current);
        mergeTimerRef.current = null;
      }
      setMergeTargetId(null);

      const activeItem = allItems.find(item => item.id === active.id);
      const overItem = allItems.find(item => item.id === over.id);

      if (!activeItem || !overItem) return;

      if (activeItem.itemType === 'shortcut') {
        const canMerge = overItem.itemType === 'folder' || 
                         overItem.itemType === 'shortcut';
        
        if (canMerge) {
          mergeTimerRef.current = setTimeout(() => {
            setMergeTargetId(over.id as string);
          }, 600);
        }
      }
    }
  };

  // 拖拽结束
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (mergeTimerRef.current) {
      clearTimeout(mergeTimerRef.current);
      mergeTimerRef.current = null;
    }

    const isMergeAction = mergeTargetId && over && mergeTargetId === over.id;
    
    setActiveId(null);
    setMergeTargetId(null);
    lastOverIdRef.current = null;

    if (!over) return;

    if (isMergeAction) {
      const activeItem = allItems.find(item => item.id === active.id);
      const overItem = allItems.find(item => item.id === over.id);

      if (!activeItem || !overItem) return;

      if (activeItem.itemType === 'shortcut' && overItem.itemType === 'folder') {
        moveShortcutToFolder(active.id as string, over.id as string);
        return;
      }

      if (activeItem.itemType === 'shortcut' && overItem.itemType === 'shortcut') {
        const newFolderId = addFolder('新文件夹', activeGroupId ?? undefined);
        moveShortcutToFolder(over.id as string, newFolderId);
        moveShortcutToFolder(active.id as string, newFolderId);
        return;
      }
    }

    if (active.id !== over.id) {
      const oldIndex = shortcuts.findIndex((s) => s.id === active.id);
      const newIndex = shortcuts.findIndex((s) => s.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        reorderShortcuts(oldIndex, newIndex);
      }
    }
  };

  // 分页切换
  const goToPage = useCallback((targetPage: number) => {
    const clampedPage = Math.max(0, Math.min(totalPages - 1, targetPage));
    if (clampedPage !== currentPage && !isChangingRef.current) {
      isChangingRef.current = true;
      setCurrentPage(clampedPage);
      setTimeout(() => {
        isChangingRef.current = false;
        accumulatedRef.current = 0;
      }, 400);
    }
  }, [totalPages, currentPage]);

  // 滚轮分页
  useEffect(() => {
    if (totalPages <= 1) return;

    const handleWheel = (e: WheelEvent) => {
      if (isChangingRef.current) return;

      const now = Date.now();
      if (now - lastTimeRef.current > 200) {
        accumulatedRef.current = 0;
      }
      lastTimeRef.current = now;

      const isHorizontalSwipe = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      const isMouseWheel = e.deltaX === 0 && e.deltaY !== 0;

      let scrollDelta = 0;
      if (isHorizontalSwipe) {
        scrollDelta = e.deltaX;
      } else if (isMouseWheel) {
        scrollDelta = e.deltaY;
      } else {
        return;
      }

      accumulatedRef.current += scrollDelta;
      const threshold = 50;

      if (accumulatedRef.current > threshold) {
        goToPage(currentPage + 1);
        accumulatedRef.current = 0;
      } else if (accumulatedRef.current < -threshold) {
        goToPage(currentPage - 1);
        accumulatedRef.current = 0;
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [totalPages, currentPage, goToPage]);

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        goToPage(currentPage - 1);
      } else if (e.key === 'ArrowRight') {
        goToPage(currentPage + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, goToPage]);

  // 重置页码
  useEffect(() => {
    if (currentPage >= totalPages && totalPages > 0) {
      setCurrentPage(totalPages - 1);
    }
  }, [allItems.length, totalPages, currentPage]);

  // 获取拖拽中的项目
  const activeItem = activeId 
    ? allItems.find(item => item.id === activeId) 
    : null;

  // 文件夹操作
  const handleEditFolder = () => {
    if (openFolder) {
      setEditingFolder(openFolder);
      setOpenFolderId(null);
      setShowAddFolderModal(true);
    }
  };

  const handleSaveFolder = (name: string) => {
    if (editingFolder) {
      updateFolder(editingFolder.id, { name });
      setEditingFolder(null);
    } else {
      addFolder(name, activeGroupId ?? undefined);
    }
  };

  const handleDeleteFolder = () => {
    if (openFolderId && confirm('删除文件夹后，其中的快捷方式将移出。确定删除？')) {
      removeFolder(openFolderId);
      setOpenFolderId(null);
    }
  };

  const handleAddShortcutToFolder = (url: string, title: string) => {
    if (openFolderId) {
      const domain = new URL(url).hostname;
      addShortcut({
        url,
        title,
        favicon: `${FAVICON_API}${domain}&sz=64`,
        groupId: activeGroupId ?? undefined,
        folderId: openFolderId,
      });
    }
    setShowAddToFolderModal(false);
  };

  // 添加菜单状态
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    };
    if (showAddMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAddMenu]);

  // 统一添加按钮（点击显示菜单，右键批量编辑）
  const AddButton = () => (
    <div ref={addMenuRef} className="relative flex flex-col items-center gap-2 w-16">
      <button
        onClick={() => setShowAddMenu(!showAddMenu)}
        onContextMenu={(e) => {
          e.preventDefault();
          if (onBatchEditClick) onBatchEditClick();
        }}
        className="w-14 h-14 rounded-[18px] bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all border border-white/10 cursor-pointer group"
        title="添加 | 右键批量编辑"
      >
        <Plus className={`w-6 h-6 text-white/60 transition-transform ${showAddMenu ? 'rotate-45' : ''}`} />
      </button>
      <span className="text-sm text-white/60">添加</span>
      
      {/* 下拉菜单 */}
      {showAddMenu && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 min-w-[140px] py-2 rounded-xl bg-black/70 backdrop-blur-xl border border-white/10 shadow-xl animate-scaleIn">
          <button
            onClick={() => {
              setShowAddMenu(false);
              if (onAddClick) onAddClick();
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 transition-colors"
          >
            <Link className="w-4 h-4" />
            快捷方式
          </button>
          <button
            onClick={() => {
              setShowAddMenu(false);
              setShowAddFolderModal(true);
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 transition-colors"
          >
            <FolderPlus className="w-4 h-4" />
            文件夹
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div ref={containerRef} className="w-full overflow-hidden">
          <div
            className="flex transition-transform duration-300 ease-out"
            style={{ transform: `translateX(${-currentPage * 100}%)` }}
          >
            {pages.map((pageItems, pageIndex) => (
              <div key={pageIndex} className="shrink-0 w-full flex justify-center">
                <SortableContext
                  items={pageItems.map(item => item.id)}
                  strategy={rectSortingStrategy}
                >
                  <div className={`grid ${gridCols[columns]} gap-x-6 gap-y-4 justify-items-center py-4`}>
                    {pageItems.map((item) => (
                      item.itemType === 'folder' ? (
                        <ShortcutFolderItem
                          key={item.id}
                          folder={item as ShortcutFolder}
                          shortcuts={getFolderShortcuts(item.id)}
                          onOpen={setOpenFolderId}
                          isMergeTarget={mergeTargetId === item.id}
                        />
                      ) : (
                        <SortableShortcutItem
                          key={item.id}
                          shortcut={item as Shortcut}
                          style={style}
                          isMergeTarget={mergeTargetId === item.id}
                          onContextMenu={onBatchEditClick ? () => onBatchEditClick() : undefined}
                        />
                      )
                    ))}
                    {pageIndex === pages.length - 1 && <AddButton />}
                  </div>
                </SortableContext>
              </div>
            ))}
          </div>
        </div>

        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-4">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => goToPage(i)}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === currentPage ? 'bg-white/80 w-4' : 'bg-white/30 hover:bg-white/50'
                }`}
              />
            ))}
          </div>
        )}

        <DragOverlay>
          {activeItem && (
            <DragOverlayItem 
              item={activeItem} 
              shortcuts={activeItem.itemType === 'folder' ? getFolderShortcuts(activeItem.id) : []}
            />
          )}
        </DragOverlay>
      </DndContext>

      {openFolder && (
        <FolderModal
          folder={openFolder}
          shortcuts={openFolderShortcuts}
          onClose={() => setOpenFolderId(null)}
          onAddShortcut={() => setShowAddToFolderModal(true)}
          onEditFolder={handleEditFolder}
          onDeleteFolder={handleDeleteFolder}
        />
      )}

      <AddFolderModal
        isOpen={showAddFolderModal}
        onClose={() => {
          setShowAddFolderModal(false);
          setEditingFolder(null);
        }}
        onSave={handleSaveFolder}
        folder={editingFolder ?? undefined}
      />

      {showAddToFolderModal && (
        <AddShortcutModal
          isOpen={showAddToFolderModal}
          onClose={() => setShowAddToFolderModal(false)}
          onAdd={handleAddShortcutToFolder}
          groupName={openFolder?.name}
        />
      )}
    </>
  );
}
