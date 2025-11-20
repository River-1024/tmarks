import { useState } from 'react'
import { Database, Download, Upload, FileJson, FileCode } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { ExportSection } from '@/components/import-export/ExportSection'
import { ImportSection } from '@/components/import-export/ImportSection'
import { BOOKMARKS_QUERY_KEY } from '@/hooks/useBookmarks'
import { TAGS_QUERY_KEY } from '@/hooks/useTags'
import type { ExportFormat, ExportOptions, ImportResult } from '@shared/import-export-types'

export function DataSettingsTab() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export')
  const [lastOperation, setLastOperation] = useState<{
    type: 'export' | 'import'
    timestamp: string
    details: string
  } | null>(null)

  // 处理导出完成
  const handleExportComplete = (format: ExportFormat, options: ExportOptions) => {
    setLastOperation({
      type: 'export',
      timestamp: new Date().toLocaleString(),
      details: `导出为 ${format.toUpperCase()} 格式${options.include_tags ? '，包含标签' : ''}${options.include_metadata ? '，包含元数据' : ''}`
    })
  }

  // 处理导入完成
  const handleImportComplete = (result: ImportResult) => {
    setLastOperation({
      type: 'import',
      timestamp: new Date().toLocaleString(),
      details: `成功导入 ${result.success} 个书签，创建 ${result.created_tags.length} 个标签${result.failed > 0 ? `，${result.failed} 个失败` : ''}`
    })

    // 刷新书签和标签缓存
    queryClient.invalidateQueries({ queryKey: [BOOKMARKS_QUERY_KEY] })
    queryClient.invalidateQueries({ queryKey: [TAGS_QUERY_KEY] })
  }

  return (
    <div className="space-y-6">
      {/* 数据管理 */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">数据导入导出</h3>
          <p className="text-sm text-muted-foreground mt-1">
            导入、导出和备份你的书签数据
          </p>
        </div>

        {/* 标签页切换 */}
        <div className="flex gap-2 border-b border-border">
          <button
            onClick={() => setActiveTab('export')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
              activeTab === 'export'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Download className="w-4 h-4" />
            导出数据
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
              activeTab === 'import'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Upload className="w-4 h-4" />
            导入数据
          </button>
        </div>

        {/* 内容区域 */}
        <div className="p-4 rounded-lg border border-border bg-card">
          {activeTab === 'export' && (
            <ExportSection onExport={handleExportComplete} />
          )}

          {activeTab === 'import' && (
            <ImportSection onImport={handleImportComplete} />
          )}
        </div>

        {/* 最近操作 */}
        {lastOperation && (
          <div className="p-4 rounded-lg border border-border bg-card">
            <div className="flex items-start gap-3">
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                lastOperation.type === 'export'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-success/10 text-success'
              }`}>
                {lastOperation.type === 'export' ? (
                  <Download className="w-4 h-4" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground text-sm">
                    {lastOperation.type === 'export' ? '数据导出' : '数据导入'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {lastOperation.timestamp}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {lastOperation.details}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border"></div>

      {/* 导出功能说明 */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">导出功能</h3>
          <p className="text-sm text-muted-foreground mt-1">
            支持多种格式，满足不同需求
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30">
            <FileJson className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium mb-1">JSON 格式</div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>• 包含完整数据，适合备份和迁移</div>
                <div>• 可选择包含标签、元数据等信息</div>
                <div>• 支持重新导入到本系统</div>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30">
            <FileCode className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium mb-1">HTML 格式</div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>• 兼容浏览器标准格式</div>
                <div>• 可直接导入 Chrome、Firefox、Edge 等浏览器</div>
                <div>• 保留文件夹结构和书签层级</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-border"></div>

      {/* 导入功能说明 */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">导入功能</h3>
          <p className="text-sm text-muted-foreground mt-1">
            从多种来源导入书签数据
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30">
            <Upload className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium mb-1">支持的格式</div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>• 浏览器导出的 HTML 书签文件</div>
                <div>• JSON 格式的书签数据</div>
                <div>• 自动检测和跳过重复书签</div>
                <div>• 可将文件夹结构转换为标签</div>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30">
            <Database className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium mb-1">智能处理</div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>• 支持批量处理大文件</div>
                <div>• 自动提取书签元数据</div>
                <div>• 保留创建时间和描述信息</div>
                <div>• 显示详细的导入结果报告</div>
              </div>
            </div>
          </div>
        </div>
      </div>


    </div>
  )
}
