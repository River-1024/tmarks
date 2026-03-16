import { useTranslation } from 'react-i18next'
import { tabGroupsService } from '@/services/tab-groups'
import type { TabGroup, TabGroupItem } from '@/lib/types'
import { useToastStore } from '@/stores/toastStore'
import { logger } from '@/lib/logger'

interface UseBatchActionsProps {
  tabGroups: TabGroup[]
  setTabGroups: React.Dispatch<React.SetStateAction<TabGroup[]>>
  selectedItems: Set<string>
  setSelectedItems: React.Dispatch<React.SetStateAction<Set<string>>>
  setConfirmDialog: React.Dispatch<React.SetStateAction<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
  }>>
  confirmDialog: {
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
  }
  enqueueSyncOperation?: (operation: { description: string; run: () => Promise<unknown> }) => void
}

export function useBatchActions({
  tabGroups,
  setTabGroups,
  selectedItems,
  setSelectedItems,
  setConfirmDialog,
  confirmDialog,
  enqueueSyncOperation,
}: UseBatchActionsProps) {
  const { t } = useTranslation('tabGroups')
  const { success, error: showError } = useToastStore()

  const handleBatchDelete = () => {
    if (selectedItems.size === 0) return

    setConfirmDialog({
      isOpen: true,
      title: t('confirm.batchDelete'),
      message: t('confirm.batchDeleteMessage', { count: selectedItems.size }),
      onConfirm: async () => {
        setConfirmDialog({ ...confirmDialog, isOpen: false })
        try {
          if (enqueueSyncOperation) {
            Array.from(selectedItems).forEach((itemId) => {
              enqueueSyncOperation({
                description: `delete-tab-item:${itemId}`,
                run: () => tabGroupsService.deleteTabGroupItem(itemId),
              })
            })
          } else {
            await Promise.all(
              Array.from(selectedItems).map((itemId) =>
                tabGroupsService.deleteTabGroupItem(itemId)
              )
            )
          }

          setTabGroups((prev) =>
            prev.map((group) => ({
              ...group,
              items: group.items?.filter((item) => !selectedItems.has(item.id)),
              item_count: (group.item_count || 0) - Array.from(selectedItems).filter((id) =>
                group.items?.some((item) => item.id === id)
              ).length,
            }))
          )

          setSelectedItems(new Set())
          success(t('message.batchDeleteSuccess'))
        } catch (err) {
          logger.error('Failed to batch delete:', err)
          showError(t('message.batchDeleteFailed'))
        }
      },
    })
  }

  const handleBatchPin = async () => {
    if (selectedItems.size === 0) return

    try {
      if (enqueueSyncOperation) {
        Array.from(selectedItems).forEach((itemId) => {
          enqueueSyncOperation({
            description: `update-tab-item-pin:${itemId}`,
            run: () => tabGroupsService.updateTabGroupItem(itemId, { is_pinned: true }),
          })
        })
      } else {
        await Promise.all(
          Array.from(selectedItems).map((itemId) =>
            tabGroupsService.updateTabGroupItem(itemId, { is_pinned: true })
          )
        )
      }

      setTabGroups((prev) =>
        prev.map((group) => ({
          ...group,
          items: group.items?.map((item) =>
            selectedItems.has(item.id) ? { ...item, is_pinned: true } : item
          ),
        }))
      )

      setSelectedItems(new Set())
      success(t('message.batchPinSuccess'))
    } catch (err) {
      logger.error('Failed to batch pin:', err)
      showError(t('message.batchPinFailed'))
    }
  }

  const handleBatchTodo = async () => {
    if (selectedItems.size === 0) return

    try {
      if (enqueueSyncOperation) {
        Array.from(selectedItems).forEach((itemId) => {
          enqueueSyncOperation({
            description: `update-tab-item-todo:${itemId}`,
            run: () => tabGroupsService.updateTabGroupItem(itemId, { is_todo: true }),
          })
        })
      } else {
        await Promise.all(
          Array.from(selectedItems).map((itemId) =>
            tabGroupsService.updateTabGroupItem(itemId, { is_todo: true })
          )
        )
      }

      setTabGroups((prev) =>
        prev.map((group) => ({
          ...group,
          items: group.items?.map((item) =>
            selectedItems.has(item.id) ? { ...item, is_todo: true } : item
          ),
        }))
      )

      setSelectedItems(new Set())
      success(t('message.batchTodoSuccess'))
    } catch (err) {
      logger.error('Failed to batch todo:', err)
      showError(t('message.batchTodoFailed'))
    }
  }

  const handleBatchExport = () => {
    if (selectedItems.size === 0) return

    // Get all selected items from all groups
    const selectedItemsData: TabGroupItem[] = []
    tabGroups.forEach((group) => {
      group.items?.forEach((item) => {
        if (selectedItems.has(item.id)) {
          selectedItemsData.push(item)
        }
      })
    })

    // Generate markdown
    let markdown = `# ${t('export.title')}\n\n`
    markdown += `${t('export.exportTime')}: ${new Date().toLocaleString()}\n`
    markdown += `${t('export.tabCount')}: ${selectedItemsData.length}\n\n`
    markdown += `---\n\n`

    selectedItemsData.forEach((item, index) => {
      markdown += `${index + 1}. [${item.title}](${item.url})\n`
      if (item.is_pinned) markdown += `   - 📌 ${t('item.pinned')}\n`
      if (item.is_todo) markdown += `   - ✅ ${t('item.todo')}\n`
      markdown += '\n'
    })

    // Download
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `batch-export-${Date.now()}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    success(t('message.exportSuccess'))
  }

  const handleDeselectAll = () => {
    setSelectedItems(new Set())
  }

  return {
    handleBatchDelete,
    handleBatchPin,
    handleBatchTodo,
    handleBatchExport,
    handleDeselectAll,
  }
}

