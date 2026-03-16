import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { tabGroupsService } from '@/services/tab-groups'
import { logger } from '@/lib/logger'
import type { TabGroup, TabGroupItem } from '@/lib/types'
import { ShareDialog } from '@/components/tab-groups/ShareDialog'
import type { SortOption } from '@/components/tab-groups/sortUtils'
import { sortTabGroups } from '@/components/tab-groups/sortUtils'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { SearchBar } from '@/components/tab-groups/SearchBar'
import { BatchActionBar } from '@/components/tab-groups/BatchActionBar'
import { EmptyState } from '@/components/tab-groups/EmptyState'
import { TabGroupHeader } from '@/components/tab-groups/TabGroupHeader'
import { TabItemList } from '@/components/tab-groups/TabItemList'
import { TabGroupTree } from '@/components/tab-groups/TabGroupTree'
import { TodoSidebar } from '@/components/tab-groups/TodoSidebar'
import { PinnedItemsSection } from '@/components/tab-groups/PinnedItemsSection'
import { ResizablePanel } from '@/components/common/ResizablePanel'
import { arrayMove } from '@dnd-kit/sortable'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useTabGroupActions } from '@/hooks/useTabGroupActions'
import { useBatchActions } from '@/hooks/useBatchActions'
import { searchInFields } from '@/lib/search-utils'
import { MoveItemDialog } from '@/components/tab-groups/MoveItemDialog'
import { usePreferences } from '@/hooks/usePreferences'
import { useIsMobile, useIsDesktop } from '@/hooks/useMediaQuery'
import { Drawer } from '@/components/common/Drawer'
import { BottomNav } from '@/components/common/BottomNav'
import { MobileHeader } from '@/components/common/MobileHeader'
import { useToastStore } from '@/stores/toastStore'
import { Save } from 'lucide-react'

export function TabGroupsPage() {
  const { t } = useTranslation('tabGroups')
  const { t: tc } = useTranslation('common')
  const { success, error: showError } = useToastStore()
  const [tabGroups, setTabGroups] = useState<TabGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [highlightedDomain, setHighlightedDomain] = useState<string | null>(null)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [batchMode, setBatchMode] = useState(false)
  const [sortBy, setSortBy] = useState<SortOption>('created')
  const [sharingGroupId, setSharingGroupId] = useState<string | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const searchCleanupTimerRef = useRef<NodeJS.Timeout | null>(null)
  const pendingSyncOperationsRef = useRef<Array<{ id: string; description: string; run: () => Promise<unknown> }>>([])
  const [pendingSyncCount, setPendingSyncCount] = useState(0)
  const [isSavingSync, setIsSavingSync] = useState(false)
  const [autoSyncSeconds, setAutoSyncSeconds] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const saved = window.localStorage.getItem('tab-groups-auto-sync-seconds')
    const parsed = saved ? Number(saved) : 0
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
  })

  // 移动端状态
  const isMobile = useIsMobile()
  const isDesktop = useIsDesktop()
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  // 拖拽状态
  const [activeId, setActiveId] = useState<string | null>(null)

  // Move item dialog state
  const [moveItemDialog, setMoveItemDialog] = useState<{
    isOpen: boolean
    item: TabGroupItem | null
    currentGroupId: string
  }>({
    isOpen: false,
    item: null,
    currentGroupId: '',
  })

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  })

  function enqueueSyncOperation(operation: { description: string; run: () => Promise<unknown> }) {
    pendingSyncOperationsRef.current.push({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ...operation,
    })
    setPendingSyncCount(pendingSyncOperationsRef.current.length)
  }

  // Use custom hooks
  const {
    editingItemId,
    setEditingItemId,
    editingTitle,
    setEditingTitle,
    editingGroupId,
    setEditingGroupId,
    editingGroupTitle,
    setEditingGroupTitle,
    handleDelete,
    handleOpenAll,
    handleExportMarkdown,
    handleEditGroup,
    handleSaveGroupEdit,
    handleEditItem,
    handleSaveEdit,
    handleTogglePin,
    handleToggleTodo,
    handleDeleteItem,
  } = useTabGroupActions({
    setTabGroups,
    setDeletingId,
    setConfirmDialog,
    confirmDialog,
    enqueueSyncOperation,
  })

  const {
    handleBatchDelete,
    handleBatchPin,
    handleBatchTodo,
    handleBatchExport,
    handleDeselectAll,
  } = useBatchActions({
    tabGroups,
    setTabGroups,
    selectedItems,
    setSelectedItems,
    setConfirmDialog,
    confirmDialog,
    enqueueSyncOperation,
  })

  // 拖拽传感器
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 移动 8px 后才开始拖拽
      },
    }),
    useSensor(KeyboardSensor)
  )

  useEffect(() => {
    loadTabGroups()
  }, [])

  const flushPendingSync = useCallback(
    async (trigger: 'manual' | 'auto' = 'manual') => {
      if (isSavingSync || pendingSyncOperationsRef.current.length === 0) return

      setIsSavingSync(true)
      const operations = [...pendingSyncOperationsRef.current]
      pendingSyncOperationsRef.current = []
      setPendingSyncCount(0)

      const failed: Array<{ id: string; description: string; run: () => Promise<unknown> }> = []

      for (const op of operations) {
        try {
          await op.run()
        } catch (err) {
          logger.error(`[TabGroupsPage] Sync failed: ${op.description}`, err)
          failed.push(op)
        }
      }

      if (failed.length > 0) {
        pendingSyncOperationsRef.current = [...failed, ...pendingSyncOperationsRef.current]
        setPendingSyncCount(pendingSyncOperationsRef.current.length)
        showError(t('sync.saveFailed', { count: failed.length }))
      } else {
        if (trigger === 'manual') {
          success(t('sync.saveSuccess'))
        }
        await loadTabGroups()
      }

      setIsSavingSync(false)
    },
    [isSavingSync, showError, success, t]
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('tab-groups-auto-sync-seconds', String(autoSyncSeconds))
  }, [autoSyncSeconds])

  useEffect(() => {
    if (autoSyncSeconds <= 0) return
    const timer = window.setInterval(() => {
      void flushPendingSync('auto')
    }, autoSyncSeconds * 1000)
    return () => window.clearInterval(timer)
  }, [autoSyncSeconds, flushPendingSync])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (pendingSyncOperationsRef.current.length === 0) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // 搜索防抖：延迟300ms更新实际搜索关键词
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // 获取用户偏好设置
  const { data: preferences } = usePreferences()

  // 搜索自动清空 - 根据用户设置
  useEffect(() => {
    // 清除之前的定时器
    if (searchCleanupTimerRef.current) {
      clearTimeout(searchCleanupTimerRef.current)
      searchCleanupTimerRef.current = null
    }

    // 检查是否启用搜索自动清空
    const enableAutoClear = preferences?.enable_search_auto_clear ?? true
    const clearSeconds = preferences?.search_auto_clear_seconds ?? 15

    // 如果启用了自动清空且有搜索关键词，设置定时器
    if (enableAutoClear && searchQuery.trim()) {
      searchCleanupTimerRef.current = setTimeout(() => {
        setSearchQuery('')
        setDebouncedSearchQuery('')
      }, clearSeconds * 1000)
    }

    // 清理函数
    return () => {
      if (searchCleanupTimerRef.current) {
        clearTimeout(searchCleanupTimerRef.current)
        searchCleanupTimerRef.current = null
      }
    }
  }, [searchQuery, preferences?.enable_search_auto_clear, preferences?.search_auto_clear_seconds])

  async function loadTabGroups() {
    try {
      setIsLoading(true)
      setError(null)
      const groups = await tabGroupsService.getAllTabGroups()
      // 调试日志：查看返回的数据
      logger.log('[TabGroupsPage] Loaded groups:', groups.length)
      groups.forEach((g, i) => {
        logger.log(`[TabGroupsPage] Group ${i}: ${g.title}, items: ${g.items?.length || 0}`)
      })
      setTabGroups(groups)
    } catch (err) {
      logger.error('Failed to load tab groups:', err)
      setError(t('page.loadFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  // 只刷新左侧树形列表，不影响中间和右侧列
  const refreshTreeOnly = async () => {
    if (pendingSyncOperationsRef.current.length > 0) {
      showError(t('sync.pendingRefreshBlocked'))
      return
    }

    try {
      const groups = await tabGroupsService.getAllTabGroups()
      // 保持当前选中的分组不变
      const currentSelectedGroup = selectedGroupId
        ? groups.find(g => g.id === selectedGroupId)
        : null

      setTabGroups(groups)

      // 如果当前选中的分组仍然存在，保持选中状态
      // 这样中间列的内容不会改变
      if (currentSelectedGroup) {
        // 不需要重新设置 selectedGroupId，因为它没有改变
        // 中间列会继续显示相同的内容
      }
    } catch (err) {
      logger.error('Failed to refresh tree:', err)
      setError(t('page.refreshFailed'))
    }
  }

  const handleCreateFolder = async () => {
    try {
      const newFolder = await tabGroupsService.createFolder(t('folder.newFolder'))
      setTabGroups((prev) => [...prev, { ...newFolder, items: newFolder.items || [] }])
    } catch (err) {
      logger.error('Failed to create folder:', err)
      setError(t('page.createFolderFailed'))
    }
  }

  const handleRenameGroup = async (groupId: string, newTitle: string) => {
    const title = newTitle.trim()
    if (!title) return

    setTabGroups((prev) =>
      prev.map((group) => (group.id === groupId ? { ...group, title } : group))
    )
    enqueueSyncOperation({
      description: `rename-group:${groupId}`,
      run: () => tabGroupsService.updateTabGroup(groupId, { title }),
    })
  }

  const handleMoveGroup = async (groupId: string, newParentId: string | null, newPosition: number) => {
    logger.log('📦 handleMoveGroup:', { groupId, newParentId, newPosition })

    // 获取拖拽项
    const draggedGroup = tabGroups.find(g => g.id === groupId)
    if (!draggedGroup) {
      logger.error('Dragged group not found')
      return
    }

    // 获取同级所有项（包括拖拽项）
    const siblings = tabGroups.filter(g =>
      (g.parent_id || null) === newParentId
    )

    // 按当前 position 排序
    siblings.sort((a, b) => (a.position || 0) - (b.position || 0))

    // 移除拖拽项（如果在同级中）
    const draggedIndex = siblings.findIndex(g => g.id === groupId)
    if (draggedIndex !== -1) {
      siblings.splice(draggedIndex, 1)
    }

    // 插入到新位置
    siblings.splice(newPosition, 0, draggedGroup)

    // 重新分配 position（从 0 开始）
    const updates = siblings.map((g, index) => ({
      id: g.id,
      position: index,
      parent_id: newParentId
    }))

    logger.log('  → Reordering', updates.length, 'items')

    const updateMap = new Map(updates.map((item) => [item.id, item]))
    setTabGroups((prev) =>
      prev.map((group) => {
        const update = updateMap.get(group.id)
        if (!update) return group
        return {
          ...group,
          parent_id: update.parent_id,
          position: update.position,
        }
      })
    )

    updates.forEach((update) => {
      enqueueSyncOperation({
        description: `move-group:${update.id}`,
        run: () =>
          tabGroupsService.updateTabGroup(update.id, {
            position: update.position,
            parent_id: update.parent_id,
          }),
      })
    })
  }

  const handleItemClick = (item: TabGroupItem, e: React.MouseEvent | React.ChangeEvent<HTMLInputElement>) => {
    if (batchMode) {
      e.preventDefault()
      const newSelected = new Set(selectedItems)
      if (newSelected.has(item.id)) {
        newSelected.delete(item.id)
      } else {
        newSelected.add(item.id)
      }
      setSelectedItems(newSelected)
      return
    }

    const domain = extractDomain(item.url)
    if (highlightedDomain === domain) {
      setHighlightedDomain(null)
    } else {
      setHighlightedDomain(domain)
    }
  }

  const extractDomain = (url: string): string => {
    try {
      const urlObj = new URL(url)
      return urlObj.hostname
    } catch {
      return ''
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over || active.id === over.id) return

    // 查找拖拽的项目和目标项目
    let sourceGroup: TabGroup | undefined
    let sourceItem: TabGroupItem | undefined
    let targetGroup: TabGroup | undefined
    let targetItem: TabGroupItem | undefined

    // 找到源项目和源组
    for (const group of tabGroups) {
      const item = group.items?.find((i) => i.id === active.id)
      if (item) {
        sourceGroup = group
        sourceItem = item
        break
      }
    }

    // 找到目标项目和目标组
    for (const group of tabGroups) {
      const item = group.items?.find((i) => i.id === over.id)
      if (item) {
        targetGroup = group
        targetItem = item
        break
      }
    }

    if (!sourceGroup || !sourceItem || !targetGroup || !targetItem) return

    // 同一个组内移动
    if (sourceGroup.id === targetGroup.id) {
      if (!sourceGroup.items) {
        logger.error('Source group items is undefined')
        return
      }

      const oldIndex = sourceGroup.items.findIndex((item) => item.id === active.id)
      const newIndex = sourceGroup.items.findIndex((item) => item.id === over.id)

      const newItems = arrayMove(sourceGroup.items, oldIndex, newIndex)

      // Update local state immediately
      setTabGroups((prev) =>
        prev.map((g) =>
          g.id === sourceGroup.id ? { ...g, items: newItems } : g
        )
      )

      newItems.forEach((item: TabGroupItem, index: number) => {
        enqueueSyncOperation({
          description: `reorder-item:${item.id}`,
          run: () => tabGroupsService.updateTabGroupItem(item.id, { position: index }),
        })
      })
    } else {
      // 跨组移动
      if (!sourceGroup.items || !targetGroup.items) {
        logger.error('Source or target group items is undefined')
        return
      }

      const targetIndex = targetGroup.items.findIndex((item) => item.id === over.id)

      // 从源组移除
      const newSourceItems = sourceGroup.items.filter((item) => item.id !== active.id)

      // 添加到目标组
      const newTargetItems = [...targetGroup.items]
      newTargetItems.splice(targetIndex, 0, sourceItem)

      // Update local state immediately
      setTabGroups((prev) =>
        prev.map((g) => {
          if (g.id === sourceGroup.id) {
            return { ...g, items: newSourceItems, item_count: newSourceItems.length }
          }
          if (g.id === targetGroup.id) {
            return { ...g, items: newTargetItems, item_count: newTargetItems.length }
          }
          return g
        })
      )

      enqueueSyncOperation({
        description: `move-item:${sourceItem.id}`,
        run: () => tabGroupsService.moveTabGroupItem(sourceItem.id, targetGroup.id, targetIndex),
      })

      newSourceItems.forEach((item: TabGroupItem, index: number) => {
        enqueueSyncOperation({
          description: `source-reorder-item:${item.id}`,
          run: () => tabGroupsService.updateTabGroupItem(item.id, { position: index }),
        })
      })

      newTargetItems.forEach((item: TabGroupItem, index: number) => {
        enqueueSyncOperation({
          description: `target-reorder-item:${item.id}`,
          run: () => tabGroupsService.updateTabGroupItem(item.id, { position: index }),
        })
      })

      logger.log('✅ Item moved across groups and queued for sync')
    }
  }

  // 打开移动对话框
  const handleMoveItem = (item: TabGroupItem) => {
    // 找到当前项目所属的组
    const currentGroup = tabGroups.find((g) => g.items?.some((i) => i.id === item.id))
    if (currentGroup) {
      setMoveItemDialog({
        isOpen: true,
        item,
        currentGroupId: currentGroup.id,
      })
    }
  }

  // 执行移动操作
  const handleMoveItemToGroup = async (targetGroupId: string) => {
    const { item, currentGroupId } = moveItemDialog
    if (!item) return

    const sourceGroup = tabGroups.find((g) => g.id === currentGroupId)
    const targetGroup = tabGroups.find((g) => g.id === targetGroupId)

    if (!sourceGroup || !targetGroup) return

    // 从源组移除
    if (!sourceGroup.items) {
      logger.error('Source group items is undefined')
      return
    }

    const newSourceItems = sourceGroup.items.filter((i) => i.id !== item.id)

    // 添加到目标组末尾
    const newTargetItems = [...(targetGroup.items || []), item]

    // Update local state immediately
    setTabGroups((prev) =>
      prev.map((g) => {
        if (g.id === currentGroupId) {
          return { ...g, items: newSourceItems, item_count: newSourceItems.length }
        }
        if (g.id === targetGroupId) {
          return { ...g, items: newTargetItems, item_count: newTargetItems.length }
        }
        return g
      })
    )

    enqueueSyncOperation({
      description: `move-item:${item.id}`,
      run: () => tabGroupsService.moveTabGroupItem(item.id, targetGroupId, newTargetItems.length - 1),
    })

    newSourceItems.forEach((i: TabGroupItem, index: number) => {
      enqueueSyncOperation({
        description: `source-reorder-item:${i.id}`,
        run: () => tabGroupsService.updateTabGroupItem(i.id, { position: index }),
      })
    })

    newTargetItems.forEach((i: TabGroupItem, index: number) => {
      enqueueSyncOperation({
        description: `target-reorder-item:${i.id}`,
        run: () => tabGroupsService.updateTabGroupItem(i.id, { position: index }),
      })
    })

    logger.log('✅ Item moved to group and queued for sync')
  }

  // 使用 useMemo 缓存筛选结果，避免每次渲染都重新计算
  // 注意：必须在所有提前返回之前调用 hooks
  const groupFilteredTabGroups = useMemo(() => {
    if (!tabGroups || tabGroups.length === 0) {
      return []
    }
    
    if (!selectedGroupId) {
      return tabGroups
    }
    
    const selectedGroup = tabGroups.find(g => g.id === selectedGroupId)
    if (!selectedGroup) {
      return []
    }
    
    // 如果选中的是文件夹，只显示所有子项（不显示文件夹本身）
    if (selectedGroup.is_folder === 1) {
      const children = tabGroups.filter(g => g.parent_id === selectedGroupId)
      return children
    }
    
    // 如果选中的是普通分组，只显示该分组
    return [selectedGroup]
  }, [selectedGroupId, tabGroups])

  // 使用防抖后的搜索关键词进行筛选（高性能版）
  const filteredTabGroups = useMemo(() => {
    if (!groupFilteredTabGroups || groupFilteredTabGroups.length === 0) {
      return []
    }
    
    if (!debouncedSearchQuery.trim()) {
      return groupFilteredTabGroups
    }

    const query = debouncedSearchQuery
    const results: TabGroup[] = []
    
    for (const group of groupFilteredTabGroups) {
      // 使用优化的搜索函数
      const matchesTitle = searchInFields([group.title], query)
      
      if (matchesTitle) {
        // 标题匹配，保留所有 items
        results.push(group)
      } else if (group.items && group.items.length > 0) {
        // 标题不匹配，筛选 items（批量搜索标题和URL）
        const filteredItems = group.items.filter((item) =>
          searchInFields([item.title, item.url], query)
        )
        
        if (filteredItems.length > 0) {
          // 只在有匹配的 items 时才创建新对象
          results.push({
            ...group,
            items: filteredItems,
          })
        }
      }
    }
    
    return results
  }, [groupFilteredTabGroups, debouncedSearchQuery])

  // 使用 useMemo 缓存排序结果
  const sortedGroups = useMemo(() => {
    if (!filteredTabGroups || filteredTabGroups.length === 0) {
      return []
    }
    return sortTabGroups(filteredTabGroups, sortBy)
  }, [filteredTabGroups, sortBy])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            {t('page.loading')}
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <button
            onClick={loadTabGroups}
            className="px-4 py-2 rounded-lg border border-border hover:bg-muted/50 transition-colors"
            style={{ color: 'var(--foreground)' }}
          >
            {tc('button.retry')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-[calc(100vh-4rem)] sm:h-[calc(100vh-5rem)] flex flex-col overflow-hidden touch-none">
      <div className={`flex ${isMobile ? 'flex-col' : ''} w-full h-full overflow-hidden touch-none`}>
      {/* 移动端顶部工具栏 */}
      {isMobile && (
        <MobileHeader
          title={t('title')}
          onMenuClick={() => setIsDrawerOpen(true)}
          showSearch={false}
          showMore={false}
        />
      )}

      {/* 左侧导航栏 - 桌面端显示，移动端改为抽屉 */}
      {isDesktop ? (
        <ResizablePanel
          side="left"
          defaultWidth={240}
          minWidth={200}
          maxWidth={400}
          storageKey="tab-groups-left-sidebar-width"
        >
          <TabGroupTree
            tabGroups={tabGroups}
            selectedGroupId={selectedGroupId}
            onSelectGroup={setSelectedGroupId}
            onCreateFolder={handleCreateFolder}
            onRenameGroup={handleRenameGroup}
            onMoveGroup={handleMoveGroup}
            onRefresh={refreshTreeOnly}
          />
        </ResizablePanel>
      ) : (
        <Drawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          title={t('title')}
          side="left"
        >
          <TabGroupTree
            tabGroups={tabGroups}
            selectedGroupId={selectedGroupId}
            onSelectGroup={(id) => {
              setSelectedGroupId(id)
              setIsDrawerOpen(false) // 选择后关闭抽屉
            }}
            onCreateFolder={handleCreateFolder}
            onRenameGroup={handleRenameGroup}
            onMoveGroup={handleMoveGroup}
            onRefresh={refreshTreeOnly}
          />
        </Drawer>
      )}

      {/* 中间内容区域 */}
      <div className={`flex-1 overflow-y-auto bg-muted/30 ${isMobile ? 'min-h-0' : ''}`}>
        <div className={`w-full px-4 ${isMobile ? 'py-4 pb-20' : 'py-6'}`}>
          {/* Header */}
          <div className="mb-6">
            {/* Title and Search Bar in one row */}
            {tabGroups.length > 0 && (
              <div className="flex flex-col gap-3 w-full">
                <div className="flex items-center gap-4 w-full">
                {/* 桌面端显示标题 */}
                {!isMobile && (
                  <h1 className="text-xl font-semibold text-foreground whitespace-nowrap flex-shrink-0">
                    {t('title')}
                  </h1>
                )}
                <SearchBar
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                  onBatchModeToggle={() => setBatchMode(!batchMode)}
                  batchMode={batchMode}
                />
                </div>

                <div className="flex items-center justify-end gap-2">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">
                    {t('sync.autoSaveSeconds')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={5}
                    value={autoSyncSeconds}
                    onChange={(event) => {
                      const next = Number(event.target.value)
                      if (!Number.isFinite(next) || next < 0) {
                        setAutoSyncSeconds(0)
                        return
                      }
                      setAutoSyncSeconds(next)
                    }}
                    className="w-20 h-9 px-2 rounded-md border border-border bg-card text-sm text-foreground"
                    title={t('sync.autoSaveSeconds')}
                  />
                  <button
                    onClick={() => void flushPendingSync('manual')}
                    disabled={pendingSyncCount === 0 || isSavingSync}
                    className="btn btn-primary btn-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={t('sync.saveNow')}
                    type="button"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSavingSync ? t('sync.saving') : t('sync.saveNow')}</span>
                    {pendingSyncCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-primary-foreground/20 text-xs">
                        {pendingSyncCount}
                      </span>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Batch Action Bar */}
            {batchMode && selectedItems.size > 0 && (
              <div className="mt-4">
                <BatchActionBar
                  selectedCount={selectedItems.size}
                  onSelectAll={() => {
                    // Select all items from all groups
                    const allItemIds = new Set<string>()
                    tabGroups.forEach((group) => {
                      group.items?.forEach((item) => {
                        allItemIds.add(item.id)
                      })
                    })
                    setSelectedItems(allItemIds)
                  }}
                  onDeselectAll={handleDeselectAll}
                  onBatchDelete={handleBatchDelete}
                  onBatchPin={handleBatchPin}
                  onBatchTodo={handleBatchTodo}
                  onBatchExport={handleBatchExport}
                  onCancel={() => {
                    setBatchMode(false)
                    setSelectedItems(new Set())
                  }}
                />
              </div>
            )}
          </div>

      {/* Empty State */}
      {tabGroups.length === 0 && <EmptyState isSearching={false} searchQuery="" />}

      {/* No Search Results */}
      {tabGroups.length > 0 && filteredTabGroups.length === 0 && (
        <EmptyState isSearching={true} searchQuery={searchQuery} />
      )}

      {/* 固定标签页区域 */}
      {sortedGroups.length > 0 && !searchQuery && (
        <PinnedItemsSection 
          tabGroups={sortedGroups}
          onUnpin={(groupId, itemId) => handleTogglePin(groupId, itemId, true)}
        />
      )}

      {/* Tab Groups Grid */}
      {sortedGroups.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 gap-6">
            {(() => {
              // 按照 parent_id 分组
              const groupsByParent = new Map<string | null, TabGroup[]>()
              sortedGroups.forEach(group => {
                const parentId = group.parent_id || null
                if (!groupsByParent.has(parentId)) {
                  groupsByParent.set(parentId, [])
                }
                groupsByParent.get(parentId)!.push(group)
              })

              // 渲染函数
              const renderGroup = (group: TabGroup) => (
                <div
                  key={group.id}
                  className="card border-l-[3px] border-l-primary p-6 hover:shadow-xl transition-all duration-200"
                >
                  <TabGroupHeader
                    group={group}
                    isEditingTitle={editingGroupId === group.id}
                    editingTitle={editingGroupTitle}
                    onEditTitle={() => handleEditGroup(group)}
                    onSaveTitle={() => handleSaveGroupEdit(group.id)}
                    onCancelEdit={() => {
                      setEditingGroupId(null)
                      setEditingGroupTitle('')
                    }}
                    onTitleChange={setEditingGroupTitle}
                    onOpenAll={() => handleOpenAll(group.items || [])}
                    onExport={() => handleExportMarkdown(group)}
                    onDelete={() => handleDelete(group.id, group.title)}
                    isDeleting={deletingId === group.id}
                    onShareClick={() => setSharingGroupId(group.id)}
                  />

                  {group.items && group.items.length > 0 && (
                    <TabItemList
                      items={group.items}
                      groupId={group.id}
                      highlightedDomain={highlightedDomain}
                      selectedItems={selectedItems}
                      batchMode={batchMode}
                      editingItemId={editingItemId}
                      editingTitle={editingTitle}
                      onItemClick={handleItemClick}
                      onEditItem={handleEditItem}
                      onSaveEdit={handleSaveEdit}
                      onTogglePin={handleTogglePin}
                      onToggleTodo={handleToggleTodo}
                      onDeleteItem={handleDeleteItem}
                      onMoveItem={handleMoveItem}
                      setEditingItemId={setEditingItemId}
                      setEditingTitle={setEditingTitle}
                      extractDomain={extractDomain}
                    />
                  )}
                </div>
              )

              // 渲染分组
              const result: JSX.Element[] = []
              
              // 如果选中了特定分组，直接显示该分组（排除文件夹）
              if (selectedGroupId) {
                sortedGroups.forEach(group => {
                  // 只渲染普通分组，不渲染文件夹
                  if (group.is_folder !== 1) {
                    result.push(renderGroup(group))
                  }
                })
              } else {
                // 显示全部时，按文件夹分组显示
                // 先显示根级别的文件夹和分组
                const rootGroups = groupsByParent.get(null) || []
                
                rootGroups.forEach(group => {
                  if (group.is_folder === 1) {
                    // 获取文件夹下的子项
                    const children = groupsByParent.get(group.id) || []
                    // 只有当文件夹有子项时才显示
                    if (children.length > 0) {
                      // 文件夹标题
                      result.push(
                        <div key={`folder-${group.id}`} className="mt-6 first:mt-0">
                          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                            <span>📁</span>
                            <span>{group.title}</span>
                            <span className="text-sm text-muted-foreground">
                              ({t('header.tabCount', { count: children.reduce((sum, g) => sum + (g.item_count || 0), 0) })})
                            </span>
                          </h2>
                          <div className="space-y-6">
                            {/* 文件夹下的子项 */}
                            {children.map(childGroup => renderGroup(childGroup))}
                          </div>
                        </div>
                      )
                    }
                  } else {
                    // 根级别的普通分组
                    result.push(renderGroup(group))
                  }
                })
              }

              return result
            })()}
          </div>

          {/* DragOverlay - 拖拽时显示的浮动元素 */}
          <DragOverlay>
            {activeId ? (
              <div
                className="bg-card border-2 border-primary rounded shadow-xl cursor-grabbing p-3 opacity-95"
                style={{
                  transform: 'scale(1.05)',
                }}
              >
                {(() => {
                  // 查找被拖拽的项目
                  for (const group of tabGroups) {
                    const item = group.items?.find((i) => i.id === activeId)
                    if (item) {
                      return (
                        <div className="flex items-center gap-3">
                          <div className="w-4 h-4 rounded bg-primary/20 flex-shrink-0" />
                          <span className="text-sm font-medium text-foreground truncate max-w-[300px]">
                            {item.title}
                          </span>
                        </div>
                      )
                    }
                  }
                  return null
                })()}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Share Dialog */}
      {sharingGroupId && (
        <ShareDialog
          groupId={sharingGroupId}
          groupTitle={tabGroups.find((g) => g.id === sharingGroupId)?.title || ''}
          onClose={() => setSharingGroupId(null)}
        />
      )}

      {/* Move Item Dialog */}
      <MoveItemDialog
        isOpen={moveItemDialog.isOpen}
        itemTitle={moveItemDialog.item?.title || ''}
        currentGroupId={moveItemDialog.currentGroupId}
        availableGroups={tabGroups}
        onMove={handleMoveItemToGroup}
        onClose={() =>
          setMoveItemDialog({
            isOpen: false,
            item: null,
            currentGroupId: '',
          })
        }
      />

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />
        </div>
      </div>

      {/* 右侧TODO栏 - 仅桌面端显示 */}
      {isDesktop && (
        <ResizablePanel
          side="right"
          defaultWidth={320}
          minWidth={280}
          maxWidth={500}
          storageKey="tab-groups-right-sidebar-width"
        >
          <TodoSidebar
            tabGroups={tabGroups}
            onUpdate={async () => {
              if (pendingSyncOperationsRef.current.length > 0) {
                showError(t('sync.pendingRefreshBlocked'))
                return
              }
              await loadTabGroups()
            }}
          />
        </ResizablePanel>
      )}

      {/* 移动端底部导航 */}
      {isMobile && <BottomNav />}
      </div>
    </div>
  )
}
