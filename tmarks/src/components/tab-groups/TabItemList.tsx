import { TabItem } from './TabItem'
import type { TabGroupItem } from '@/lib/types'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'

interface TabItemListProps {
  items: TabGroupItem[]
  groupId: string
  highlightedDomain: string | null
  selectedItems: Set<string>
  batchMode: boolean
  editingItemId: string | null
  editingTitle: string
  onItemClick: (item: TabGroupItem, e: React.MouseEvent | React.ChangeEvent<HTMLInputElement>) => void
  onEditItem: (item: TabGroupItem) => void
  onSaveEdit: (groupId: string, itemId: string) => void
  onTogglePin: (groupId: string, itemId: string, currentPinned: number) => void
  onToggleTodo: (groupId: string, itemId: string, currentTodo: number) => void
  onDeleteItem: (groupId: string, itemId: string, title: string) => void
  onMoveItem?: (item: TabGroupItem) => void
  setEditingItemId: (id: string | null) => void
  setEditingTitle: (title: string) => void
  extractDomain: (url: string) => string
}

export function TabItemList({
  items,
  groupId,
  highlightedDomain,
  selectedItems,
  batchMode,
  editingItemId,
  editingTitle,
  onItemClick,
  onEditItem,
  onSaveEdit,
  onTogglePin,
  onToggleTodo,
  onDeleteItem,
  onMoveItem,
  setEditingItemId,
  setEditingTitle,
  extractDomain,
}: TabItemListProps) {
  if (!items || items.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        此标签页组没有标签页
      </div>
    )
  }

  return (
    <SortableContext
      items={items.map((item) => item.id)}
      strategy={verticalListSortingStrategy}
    >
      <div className="space-y-2">
        {items.map((item) => {
          const domain = extractDomain(item.url)
          const isHighlighted = highlightedDomain === domain
          const isSelected = selectedItems.has(item.id)

          return (
            <TabItem
              key={item.id}
              item={item}
              groupId={groupId}
              isHighlighted={isHighlighted}
              isSelected={isSelected}
              batchMode={batchMode}
              editingItemId={editingItemId}
              editingTitle={editingTitle}
              onItemClick={onItemClick}
              onEditItem={onEditItem}
              onSaveEdit={onSaveEdit}
              onTogglePin={onTogglePin}
              onToggleTodo={onToggleTodo}
              onDeleteItem={onDeleteItem}
              onMoveItem={onMoveItem}
              setEditingItemId={setEditingItemId}
              setEditingTitle={setEditingTitle}
              extractDomain={extractDomain}
            />
          )
        })}
      </div>
    </SortableContext>
  )
}

