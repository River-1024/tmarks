import type { OperationLogEntry } from '@/lib/types'

export type OperationLogTone = 'info' | 'success' | 'warning' | 'error'

export interface OperationLogViewModel {
  eventLabel: string
  summary: string[]
  tone: OperationLogTone
  rawText: string
}

interface ChangeEntry {
  field: string
  before: unknown
  after: unknown
}

export function getOperationLogViewModel(
  log: OperationLogEntry,
  locale: string,
): OperationLogViewModel {
  const isZh = locale.toLowerCase().startsWith('zh')
  const payload = isRecord(log.payload) ? log.payload : null

  return {
    eventLabel: getEventLabel(log.event_type, isZh),
    summary: buildSummary(log, payload, isZh),
    tone: getTone(log, payload),
    rawText: buildRawText(log),
  }
}

function buildSummary(
  log: OperationLogEntry,
  payload: Record<string, unknown> | null,
  isZh: boolean,
) {
  if (!payload) {
    if (typeof log.payload === 'string' && log.payload.trim()) {
      return [truncate(log.payload.trim(), 220)]
    }
    return [
      isZh
        ? '暂未提取到明确注释，请点击查看原始数据。'
        : 'No structured summary yet. Open the raw data for details.',
    ]
  }

  switch (log.event_type) {
    case 'bookmark.created':
    case 'bookmark.deleted':
    case 'bookmark.restored':
    case 'bookmark.permanently_deleted':
      return summarizeBookmarkLifecycle(payload, isZh)
    case 'bookmark.updated':
      return summarizeBookmarkUpdate(payload, isZh)
    case 'tag.created':
    case 'tag.deleted':
      return summarizeTagLifecycle(payload, isZh)
    case 'tag.updated':
      return summarizeTagUpdate(payload, isZh)
    case 'tag.batch_deleted':
      return summarizeTagBatchDelete(payload, isZh)
    case 'tag.merged':
      return summarizeTagMerge(payload, isZh)
    case 'batch_create_bookmarks':
      return summarizeBatchCreate(payload, isZh)
    case 'batch_delete_bookmarks':
      return summarizeBatchDelete(payload, isZh)
    case 'batch_update_tags':
      return summarizeBatchUpdateTags(payload, isZh)
    case 'settings.ai.test_connection':
      return summarizeAiTest(payload, isZh)
    case 'ai.bookmarks.batch_regenerate.started':
    case 'ai.bookmarks.batch_regenerate.completed':
    case 'ai.bookmarks.batch_regenerate.request_failed':
    case 'ai.bookmarks.batch_regenerate.parse_failed':
    case 'ai.bookmarks.batch_regenerate.retry_started':
    case 'ai.bookmarks.batch_regenerate.retry_completed':
    case 'ai.bookmarks.batch_regenerate.retry_failed':
      return summarizeAiBatchRegenerate(log.event_type, payload, isZh)
    case 'ai.bookmarks.item_generated':
      return summarizeAiGeneratedItem(payload, isZh)
    case 'ai.bookmarks.batch_regenerate.apply_started':
    case 'ai.bookmarks.batch_regenerate.apply_completed':
    case 'ai.bookmarks.batch_regenerate.apply_failed':
      return summarizeAiApply(log.event_type, payload, isZh)
    case 'ai.bookmarks.single_generate.started':
    case 'ai.bookmarks.single_generate.completed':
    case 'ai.bookmarks.single_generate.request_failed':
    case 'ai.bookmarks.single_generate.parse_failed':
    case 'ai.bookmarks.single_generate.apply_completed':
    case 'ai.bookmarks.single_generate.apply_failed':
      return summarizeAiSingleGenerate(log.event_type, payload, isZh)
    case 'settings.ai.updated':
      return summarizeSettingsUpdate(payload, isZh)
    case 'settings.logs.debug':
      return summarizeDebugLog(payload, isZh)
    case 'auth.login_success':
    case 'auth.login_failed':
    case 'auth.logout':
    case 'auth.logout_all_devices':
    case 'auth.token_refreshed':
    case 'user.registered':
      return summarizeAuthEvent(log.event_type, payload, isZh)
    default: {
      const changeLines = summarizeChanges(payload, isZh)
      if (changeLines.length > 0) {
        return changeLines
      }

      const requestResponseLines = summarizeRequestResponse(payload, isZh)
      if (requestResponseLines.length > 0) {
        return requestResponseLines
      }

      const primitiveLines = summarizePrimitiveFields(payload, isZh)
      if (primitiveLines.length > 0) {
        return primitiveLines
      }

      return [
        isZh
          ? '暂未提取到明确注释，请点击查看原始数据。'
          : 'No structured summary yet. Open the raw data for details.',
      ]
    }
  }
}

function summarizeBookmarkLifecycle(payload: Record<string, unknown>, isZh: boolean) {
  const title = getString(payload.title) || (isZh ? '未命名书签' : 'Untitled bookmark')
  const url = getString(payload.url)
  const tagCount = getNumber(payload.tag_count)
  const status: string[] = []

  if (typeof payload.is_pinned === 'boolean') {
    status.push(payload.is_pinned ? (isZh ? '已置顶' : 'Pinned') : (isZh ? '未置顶' : 'Unpinned'))
  }

  if (typeof payload.is_public === 'boolean') {
    status.push(payload.is_public ? (isZh ? '公开' : 'Public') : (isZh ? '私有' : 'Private'))
  }

  if (tagCount !== null) {
    status.push(isZh ? `${tagCount} 个标签` : `${tagCount} tags`)
  }

  const lines = [`${isZh ? '书签' : 'Bookmark'}: ${quoteValue(title)}`]

  if (url) {
    lines.push(`URL: ${truncate(url, 140)}`)
  }

  if (status.length > 0) {
    lines.push(`${isZh ? '状态' : 'Status'}: ${status.join(' / ')}`)
  }

  if (payload.restored_from_deleted === true) {
    lines.push(isZh ? '来源: 从回收站恢复后重新创建' : 'Source: recreated from trash')
  }

  return lines
}

function summarizeBookmarkUpdate(payload: Record<string, unknown>, isZh: boolean) {
  const after = isRecord(payload.after) ? payload.after : null
  const before = isRecord(payload.before) ? payload.before : null
  const currentTitle =
    getString(payload.title) ||
    getString(after?.title) ||
    getString(before?.title) ||
    (isZh ? '未命名书签' : 'Untitled bookmark')
  const changes = getChangeEntries(payload)
  const lines = [`${isZh ? '书签' : 'Bookmark'}: ${quoteValue(currentTitle)}`]

  if (changes.length > 0) {
    const shownChanges = changes.slice(0, 4)
    shownChanges.forEach((change) => {
      lines.push(
        `${getFieldLabel(change.field, isZh)}: ${formatFieldValue(change.field, change.before, isZh)} -> ${formatFieldValue(change.field, change.after, isZh)}`,
      )
    })

    if (changes.length > shownChanges.length) {
      lines.push(
        isZh
          ? `其余 ${changes.length - shownChanges.length} 项变更请查看原始数据`
          : `${changes.length - shownChanges.length} more changes are available in the raw data`,
      )
    }

    return lines
  }

  const changedFields = getStringArray(payload.changed_fields)
  if (changedFields.length > 0) {
    lines.push(
      `${isZh ? '变更字段' : 'Changed fields'}: ${changedFields.map((field) => getFieldLabel(field, isZh)).join(isZh ? '、' : ', ')}`,
    )
  }

  const url = getString(payload.url)
  if (url) {
    lines.push(`URL: ${truncate(url, 140)}`)
  }

  return lines
}

function summarizeTagLifecycle(payload: Record<string, unknown>, isZh: boolean) {
  const name = getString(payload.name) || (isZh ? '未命名标签' : 'Untitled tag')
  const bookmarkCount = getNumber(payload.bookmark_count)
  const color = getString(payload.color)
  const lines = [`${isZh ? '标签' : 'Tag'}: ${quoteValue(name)}`]

  if (color) {
    lines.push(`${isZh ? '颜色' : 'Color'}: ${color}`)
  }

  if (bookmarkCount !== null) {
    lines.push(
      isZh ? `关联 ${bookmarkCount} 个书签` : `Linked to ${bookmarkCount} bookmarks`,
    )
  }

  return lines
}

function summarizeTagUpdate(payload: Record<string, unknown>, isZh: boolean) {
  const before = isRecord(payload.before) ? payload.before : null
  const after = isRecord(payload.after) ? payload.after : null
  const currentName =
    getString(after?.name) || getString(before?.name) || (isZh ? '未命名标签' : 'Untitled tag')
  const changes = getChangeEntries(payload)
  const lines = [`${isZh ? '标签' : 'Tag'}: ${quoteValue(currentName)}`]

  if (changes.length > 0) {
    changes.slice(0, 4).forEach((change) => {
      lines.push(
        `${getFieldLabel(change.field, isZh)}: ${formatFieldValue(change.field, change.before, isZh)} -> ${formatFieldValue(change.field, change.after, isZh)}`,
      )
    })
  }

  return lines
}

function summarizeTagBatchDelete(payload: Record<string, unknown>, isZh: boolean) {
  const tags = getRecordArray(payload.tags)
  const count = getNumber(payload.count) ?? tags.length
  const tagNames = tags
    .map((tag) => getString(tag.name))
    .filter((name): name is string => Boolean(name))
    .slice(0, 4)
  const lines = [isZh ? `批量删除 ${count} 个标签` : `Deleted ${count} tags in batch`]

  if (tagNames.length > 0) {
    lines.push(`${isZh ? '标签' : 'Tags'}: ${tagNames.join(isZh ? '、' : ', ')}`)
  }

  return lines
}

function summarizeTagMerge(payload: Record<string, unknown>, isZh: boolean) {
  const targetTag = isRecord(payload.target_tag) ? payload.target_tag : null
  const beforeTarget = isRecord(payload.before_target) ? payload.before_target : null
  const sourceTags = getRecordArray(payload.source_tags)
  const affectedCount = getNumber(payload.affected_count)
  const lines = [
    `${isZh ? '目标标签' : 'Target tag'}: ${quoteValue(getString(targetTag?.name) || getString(beforeTarget?.name) || (isZh ? '未命名标签' : 'Untitled tag'))}`,
  ]

  if (beforeTarget && targetTag && getString(beforeTarget.name) !== getString(targetTag.name)) {
    lines.push(
      `${isZh ? '重命名' : 'Renamed'}: ${formatGenericValue(beforeTarget.name, isZh)} -> ${formatGenericValue(targetTag.name, isZh)}`,
    )
  }

  if (sourceTags.length > 0) {
    const names = sourceTags
      .map((tag) => getString(tag.name))
      .filter((name): name is string => Boolean(name))
    lines.push(`${isZh ? '合并来源' : 'Merged from'}: ${names.join(isZh ? '、' : ', ')}`)
  }

  if (affectedCount !== null) {
    lines.push(isZh ? `合并 ${affectedCount} 个标签` : `Merged ${affectedCount} tags`)
  }

  return lines
}

function summarizeBatchCreate(payload: Record<string, unknown>, isZh: boolean) {
  const request = isRecord(payload.request) ? payload.request : null
  const response = isRecord(payload.response) ? payload.response : null
  const bookmarks = getRecordArray(request?.bookmarks)
  const total = getNumber(request?.total) ?? bookmarks.length
  const success = getNumber(response?.success)
  const failed = getNumber(response?.failed)
  const skipped = getNumber(response?.skipped)
  const sampleTitles = bookmarks
    .map((bookmark) => getString(bookmark.title))
    .filter((title): title is string => Boolean(title))
    .slice(0, 3)

  const lines = [isZh ? `提交 ${total} 个书签` : `${total} bookmarks submitted`]
  const resultParts: string[] = []

  if (success !== null) {
    resultParts.push(isZh ? `成功 ${success}` : `${success} succeeded`)
  }
  if (failed !== null) {
    resultParts.push(isZh ? `失败 ${failed}` : `${failed} failed`)
  }
  if (skipped !== null) {
    resultParts.push(isZh ? `跳过 ${skipped}` : `${skipped} skipped`)
  }
  if (resultParts.length > 0) {
    lines.push(`${isZh ? '结果' : 'Result'}: ${resultParts.join(isZh ? '，' : ', ')}`)
  }

  if (sampleTitles.length > 0) {
    lines.push(`${isZh ? '示例' : 'Sample'}: ${sampleTitles.join(isZh ? '、' : ', ')}`)
  }

  const firstError = getFirstBatchError(response?.errors)
  if (firstError) {
    lines.push(`${isZh ? '首个错误' : 'First error'}: ${truncate(firstError, 160)}`)
  }

  return lines
}

function summarizeBatchDelete(payload: Record<string, unknown>, isZh: boolean) {
  const bookmarkIds = getStringArray(payload.bookmark_ids)
  const count = getNumber(payload.count) ?? bookmarkIds.length
  const lines = [isZh ? `批量删除 ${count} 个书签` : `Deleted ${count} bookmarks in batch`]

  if (bookmarkIds.length > 0) {
    lines.push(
      `${isZh ? '涉及 ID' : 'Bookmark IDs'}: ${bookmarkIds.slice(0, 3).join(', ')}${bookmarkIds.length > 3 ? (isZh ? ` 等 ${bookmarkIds.length} 条` : ` and ${bookmarkIds.length - 3} more`) : ''}`,
    )
  }

  return lines
}

function summarizeBatchUpdateTags(payload: Record<string, unknown>, isZh: boolean) {
  const bookmarkIds = getStringArray(payload.bookmark_ids)
  const addTagIds = getStringArray(payload.add_tag_ids)
  const removeTagIds = getStringArray(payload.remove_tag_ids)
  const lines = [
    isZh
      ? `批量更新 ${bookmarkIds.length} 个书签的标签`
      : `Updated tags for ${bookmarkIds.length} bookmarks`,
  ]

  if (addTagIds.length > 0) {
    lines.push(isZh ? `新增标签 ${addTagIds.length} 个` : `${addTagIds.length} tags added`)
  }

  if (removeTagIds.length > 0) {
    lines.push(isZh ? `移除标签 ${removeTagIds.length} 个` : `${removeTagIds.length} tags removed`)
  }

  if (bookmarkIds.length > 0) {
    lines.push(
      `${isZh ? '涉及书签 ID' : 'Bookmark IDs'}: ${bookmarkIds.slice(0, 3).join(', ')}${bookmarkIds.length > 3 ? (isZh ? ` 等 ${bookmarkIds.length} 条` : ` and ${bookmarkIds.length - 3} more`) : ''}`,
    )
  }

  return lines
}

function summarizeAiTest(payload: Record<string, unknown>, isZh: boolean) {
  const request = isRecord(payload.request) ? payload.request : null
  const response = isRecord(payload.response) ? payload.response : null
  const provider = getString(request?.provider)
  const model = getString(request?.model)
  const apiUrl = getString(request?.api_url)
  const latency = getNumber(response?.latency_ms)
  const success = getBoolean(response?.success)
  const error = getString(response?.error)
  const lines: string[] = []

  if (provider || model) {
    lines.push(`${isZh ? '请求' : 'Request'}: ${[provider, model].filter(Boolean).join(' / ')}`)
  }

  if (apiUrl) {
    lines.push(`${isZh ? '接口' : 'Endpoint'}: ${truncate(apiUrl, 140)}`)
  }

  const resultLabel =
    success === null
      ? isZh
        ? '未知'
        : 'Unknown'
      : success
        ? isZh
          ? '成功'
          : 'Success'
        : isZh
          ? '失败'
          : 'Failed'

  if (success !== null || latency !== null) {
    lines.push(`${isZh ? '结果' : 'Result'}: ${latency !== null ? `${resultLabel} · ${latency}ms` : resultLabel}`)
  }

  if (error) {
    lines.push(`${isZh ? '错误' : 'Error'}: ${truncate(error, 180)}`)
  }

  return lines.length > 0
    ? lines
    : [isZh ? '已执行 AI 连接测试' : 'AI connection test executed']
}

function summarizeAiBatchRegenerate(
  eventType: string,
  payload: Record<string, unknown>,
  isZh: boolean,
) {
  const provider = getString(payload.provider)
  const model = getString(payload.model)
  const apiUrl = getString(payload.api_url)
  const bookmarkCount = getNumber(payload.bookmark_count)
  const parsedItemCount = getNumber(payload.parsed_item_count)
  const error = getString(payload.error)
  const finishReason = getString(payload.finish_reason)
  const lines: string[] = []

  if (provider || model) {
    lines.push(`${isZh ? '模型' : 'Model'}: ${[provider, model].filter(Boolean).join(' / ')}`)
  }

  if (bookmarkCount !== null) {
    lines.push(isZh ? `处理 ${bookmarkCount} 个书签` : `Processing ${bookmarkCount} bookmarks`)
  }

  if (apiUrl) {
    lines.push(`${isZh ? '接口' : 'Endpoint'}: ${truncate(apiUrl, 120)}`)
  }

  if (parsedItemCount !== null) {
    lines.push(isZh ? `解析出 ${parsedItemCount} 条 AI 回复` : `Parsed ${parsedItemCount} AI items`)
  }

  if (eventType.endsWith('started')) {
    lines.push(isZh ? 'AI 请求已发出' : 'AI request sent')
  }

  if (eventType.endsWith('retry_started')) {
    lines.push(isZh ? '检测到输出被截断，已自动发起紧凑重试' : 'Detected truncated output, started compact retry automatically')
  }

  if (eventType.endsWith('retry_completed')) {
    lines.push(isZh ? '紧凑重试成功并拿到可解析结果' : 'Compact retry succeeded with a parseable result')
  }

  if (finishReason) {
    lines.push(`${isZh ? '结束原因' : 'Finish reason'}: ${finishReason}`)
  }

  if (error) {
    lines.push(`${isZh ? '错误' : 'Error'}: ${truncate(error, 180)}`)
  }

  return lines
}

function summarizeAiGeneratedItem(payload: Record<string, unknown>, isZh: boolean) {
  const title = getString(payload.title) || (isZh ? '未命名书签' : 'Untitled bookmark')
  const generatedTags = getStringArray(payload.generated_tags)
  const existingTags = getStringArray(payload.existing_tags)
  const matched = getBoolean(payload.matched)
  const matchedBy = getString(payload.matched_by)
  const lines = [`${isZh ? '书签' : 'Bookmark'}: ${quoteValue(title)}`]

  if (generatedTags.length > 0) {
    lines.push(`${isZh ? 'AI 标签' : 'AI tags'}: ${generatedTags.join(isZh ? '、' : ', ')}`)
  }

  if (matched === false) {
    lines.push(isZh ? 'AI 回复未命中该书签，沿用了原标签' : 'No matching AI reply for this bookmark, kept original tags')
  } else if (matchedBy) {
    lines.push(`${isZh ? '匹配方式' : 'Matched by'}: ${matchedBy}`)
  }

  if (existingTags.length > 0) {
    lines.push(`${isZh ? '原标签' : 'Original tags'}: ${existingTags.join(isZh ? '、' : ', ')}`)
  }

  return lines
}

function summarizeAiApply(eventType: string, payload: Record<string, unknown>, isZh: boolean) {
  const count = getNumber(payload.count)
  const error = getString(payload.error)
  const createdTags = getRecordArray(payload.created_tags)
  const lines: string[] = []

  if (count !== null) {
    lines.push(
      eventType.endsWith('apply_started')
        ? isZh
          ? `准备应用到 ${count} 个书签`
          : `Preparing to apply changes to ${count} bookmarks`
        : isZh
          ? `已处理 ${count} 个书签`
          : `Processed ${count} bookmarks`,
    )
  }

  if (createdTags.length > 0) {
    const names = createdTags
      .map((tag) => getString(tag.name))
      .filter((name): name is string => Boolean(name))
      .slice(0, 5)
    if (names.length > 0) {
      lines.push(`${isZh ? '新增标签' : 'Created tags'}: ${names.join(isZh ? '、' : ', ')}`)
    }
  }

  if (error) {
    lines.push(`${isZh ? '错误' : 'Error'}: ${truncate(error, 180)}`)
  }

  return lines
}

function summarizeAiSingleGenerate(
  eventType: string,
  payload: Record<string, unknown>,
  isZh: boolean,
) {
  const title = getString(payload.title) || (isZh ? '未命名书签' : 'Untitled bookmark')
  const url = getString(payload.url)
  const provider = getString(payload.provider)
  const model = getString(payload.model)
  const generatedTags = getStringArray(payload.generated_tags)
  const selectedTags = getStringArray(payload.selected_tags)
  const selectedAiTags = getStringArray(payload.selected_ai_tags)
  const appliedTags = getStringArray(payload.applied_tags)
  const finishReason = getString(payload.finish_reason)
  const mode = getString(payload.mode)
  const error = getString(payload.error)
  const lines: string[] = [`${isZh ? '书签' : 'Bookmark'}: ${quoteValue(title)}`]

  if (provider || model) {
    lines.push(`${isZh ? '模型' : 'Model'}: ${[provider, model].filter(Boolean).join(' / ')}`)
  }

  if (url) {
    lines.push(`URL: ${truncate(url, 140)}`)
  }

  if (selectedTags.length > 0 && eventType.endsWith('.started')) {
    lines.push(`${isZh ? '当前标签' : 'Current tags'}: ${selectedTags.join(isZh ? '、' : ', ')}`)
  }

  if (generatedTags.length > 0) {
    lines.push(`${isZh ? 'AI 标签' : 'AI tags'}: ${generatedTags.join(isZh ? '、' : ', ')}`)
  }

  if (selectedAiTags.length > 0) {
    lines.push(`${isZh ? '选中的 AI 标签' : 'Selected AI tags'}: ${selectedAiTags.join(isZh ? '、' : ', ')}`)
  }

  if (appliedTags.length > 0) {
    lines.push(`${isZh ? '应用后标签' : 'Applied tags'}: ${appliedTags.join(isZh ? '、' : ', ')}`)
  }

  if (mode) {
    lines.push(`${isZh ? '模式' : 'Mode'}: ${mode}`)
  }

  if (finishReason) {
    lines.push(`${isZh ? '结束原因' : 'Finish reason'}: ${finishReason}`)
  }

  if (error) {
    lines.push(`${isZh ? '错误' : 'Error'}: ${truncate(error, 180)}`)
  }

  return lines
}

function summarizeSettingsUpdate(payload: Record<string, unknown>, isZh: boolean) {
  const changes = getChangeEntries(payload)
  const lines = changes.slice(0, 4).map((change) => (
    `${getFieldLabel(change.field, isZh)}: ${formatFieldValue(change.field, change.before, isZh)} -> ${formatFieldValue(change.field, change.after, isZh)}`
  ))

  if (changes.length > 4) {
    lines.push(
      isZh
        ? `其余 ${changes.length - 4} 项变更请查看原始数据`
        : `${changes.length - 4} more changes are available in the raw data`,
    )
  }

  if (payload.api_key_updated === true) {
    lines.push(isZh ? 'API Key: 已更新' : 'API key: updated')
  }

  if (lines.length > 0) {
    return lines
  }

  return summarizePrimitiveFields(payload, isZh)
}

function summarizeDebugLog(payload: Record<string, unknown>, isZh: boolean) {
  const lines: string[] = []
  const source = getString(payload.source)
  const apiVersion = getString(payload.api_version)
  const triggeredAt = getString(payload.triggered_at)

  if (source) {
    lines.push(`${isZh ? '来源' : 'Source'}: ${source}`)
  }

  if (apiVersion) {
    lines.push(`${isZh ? '接口版本' : 'API version'}: ${apiVersion}`)
  }

  if (triggeredAt) {
    lines.push(`${isZh ? '触发时间' : 'Triggered at'}: ${triggeredAt}`)
  }

  return lines
}

function summarizeAuthEvent(eventType: string, payload: Record<string, unknown>, isZh: boolean) {
  const lines: string[] = []

  switch (eventType) {
    case 'user.registered': {
      const username = getString(payload.username)
      const email = getString(payload.email)
      if (username) {
        lines.push(`${isZh ? '用户名' : 'Username'}: ${username}`)
      }
      if (email) {
        lines.push(`Email: ${email}`)
      }
      break
    }
    case 'auth.login_failed': {
      const username = getString(payload.username)
      const reason = getString(payload.reason)
      if (username) {
        lines.push(`${isZh ? '账号' : 'Account'}: ${username}`)
      }
      if (reason) {
        lines.push(`${isZh ? '原因' : 'Reason'}: ${reason}`)
      }
      break
    }
    case 'auth.login_success': {
      if (typeof payload.remember_me === 'boolean') {
        lines.push(
          `${isZh ? '记住登录' : 'Remember me'}: ${payload.remember_me ? (isZh ? '是' : 'Yes') : (isZh ? '否' : 'No')}`,
        )
      }
      const sessionId = getString(payload.session_id)
      if (sessionId) {
        lines.push(`${isZh ? '会话' : 'Session'}: ${truncate(sessionId, 60)}`)
      }
      break
    }
    case 'auth.logout':
      lines.push(isZh ? '当前设备已退出登录' : 'Current device logged out')
      break
    case 'auth.logout_all_devices':
      lines.push(isZh ? '已撤销全部设备登录态' : 'Revoked sessions on all devices')
      break
    case 'auth.token_refreshed': {
      const sessionId = getString(payload.session_id)
      if (sessionId) {
        lines.push(`${isZh ? '新会话' : 'New session'}: ${truncate(sessionId, 60)}`)
      }
      break
    }
    default:
      return summarizePrimitiveFields(payload, isZh)
  }

  return lines.length > 0 ? lines : summarizePrimitiveFields(payload, isZh)
}

function summarizeChanges(payload: Record<string, unknown>, isZh: boolean) {
  const changes = getChangeEntries(payload)
  return changes.slice(0, 4).map((change) => (
    `${getFieldLabel(change.field, isZh)}: ${formatFieldValue(change.field, change.before, isZh)} -> ${formatFieldValue(change.field, change.after, isZh)}`
  ))
}

function summarizeRequestResponse(payload: Record<string, unknown>, isZh: boolean) {
  const request = isRecord(payload.request) ? payload.request : null
  const response = isRecord(payload.response) ? payload.response : null
  const lines: string[] = []

  if (request) {
    const requestParts = [
      getString(request.provider),
      getString(request.model),
      getString(request.api_url),
    ].filter(Boolean)

    if (requestParts.length > 0) {
      lines.push(`${isZh ? '请求' : 'Request'}: ${requestParts.join(' / ')}`)
    } else if (getNumber(request.total) !== null) {
      lines.push(isZh ? `请求数量: ${getNumber(request.total)}` : `Requested items: ${getNumber(request.total)}`)
    }
  }

  if (response) {
    const success = getBoolean(response.success)
    const latency = getNumber(response.latency_ms)
    const total = getNumber(response.total)
    const failed = getNumber(response.failed)
    const summaryParts: string[] = []

    if (success !== null) {
      summaryParts.push(success ? (isZh ? '成功' : 'Success') : (isZh ? '失败' : 'Failed'))
    }
    if (latency !== null) {
      summaryParts.push(`${latency}ms`)
    }
    if (total !== null) {
      summaryParts.push(isZh ? `总数 ${total}` : `total ${total}`)
    }
    if (failed !== null) {
      summaryParts.push(isZh ? `失败 ${failed}` : `failed ${failed}`)
    }

    if (summaryParts.length > 0) {
      lines.push(`${isZh ? '响应' : 'Response'}: ${summaryParts.join(isZh ? '，' : ', ')}`)
    }
  }

  return lines
}

function summarizePrimitiveFields(payload: Record<string, unknown>, isZh: boolean) {
  const ignoredKeys = new Set(['before', 'after', 'changes', 'request', 'response'])
  const lines: string[] = []

  Object.entries(payload).forEach(([key, value]) => {
    if (ignoredKeys.has(key) || !isSimpleSummaryValue(value) || lines.length >= 4) {
      return
    }

    lines.push(`${getFieldLabel(key, isZh)}: ${formatFieldValue(key, value, isZh)}`)
  })

  return lines
}

function getTone(log: OperationLogEntry, payload: Record<string, unknown> | null): OperationLogTone {
  if (log.event_type.endsWith('failed')) {
    return 'error'
  }

  if (payload) {
    const response = isRecord(payload.response) ? payload.response : null
    if (response && response.success === false) {
      return 'error'
    }
  }

  if (
    log.event_type === 'bookmark.deleted' ||
    log.event_type === 'bookmark.permanently_deleted' ||
    log.event_type === 'batch_delete_bookmarks' ||
    log.event_type === 'tag.deleted' ||
    log.event_type === 'tag.batch_deleted'
  ) {
    return 'warning'
  }

  if (
    log.event_type === 'bookmark.created' ||
    log.event_type === 'bookmark.restored' ||
    log.event_type === 'auth.login_success' ||
    log.event_type === 'settings.ai.test_connection' ||
    log.event_type === 'user.registered' ||
    log.event_type === 'tag.created' ||
    log.event_type === 'tag.merged' ||
    log.event_type === 'ai.bookmarks.batch_regenerate.completed' ||
    log.event_type === 'ai.bookmarks.batch_regenerate.retry_completed' ||
    log.event_type === 'ai.bookmarks.item_generated' ||
    log.event_type === 'ai.bookmarks.batch_regenerate.apply_completed' ||
    log.event_type === 'ai.bookmarks.single_generate.completed' ||
    log.event_type === 'ai.bookmarks.single_generate.apply_completed'
  ) {
    return 'success'
  }

  return 'info'
}

function buildRawText(log: OperationLogEntry) {
  const rawPayload = parseRawPayload(log.payload_raw)

  return JSON.stringify(
    {
      id: log.id,
      event_type: log.event_type,
      created_at: log.created_at,
      ip: log.ip,
      user_agent: log.user_agent,
      payload: rawPayload ?? log.payload,
    },
    null,
    2,
  )
}

function parseRawPayload(payloadRaw: string | null) {
  if (!payloadRaw) {
    return null
  }

  try {
    return JSON.parse(payloadRaw) as unknown
  } catch {
    return payloadRaw
  }
}

function getChangeEntries(payload: Record<string, unknown>): ChangeEntry[] {
  const rawChanges = getRecordArray(payload.changes)
  if (rawChanges.length > 0) {
    return rawChanges
      .map((change) => {
        const field = getString(change.field)
        if (!field) {
          return null
        }

        return {
          field,
          before: change.before,
          after: change.after,
        }
      })
      .filter((change): change is ChangeEntry => change !== null)
  }

  const before = isRecord(payload.before) ? payload.before : null
  const after = isRecord(payload.after) ? payload.after : null
  if (before && after) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    return [...keys]
      .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      .map((key) => ({
        field: key,
        before: before[key],
        after: after[key],
      }))
  }

  return getStringArray(payload.changed_fields).map((field) => ({
    field,
    before: null,
    after: null,
  }))
}

function getEventLabel(eventType: string, isZh: boolean) {
  const labels: Record<string, string> = {
    'bookmark.created': isZh ? '创建书签' : 'Bookmark created',
    'bookmark.updated': isZh ? '修改书签' : 'Bookmark updated',
    'bookmark.deleted': isZh ? '删除书签' : 'Bookmark deleted',
    'bookmark.restored': isZh ? '恢复书签' : 'Bookmark restored',
    'bookmark.permanently_deleted': isZh ? '永久删除书签' : 'Bookmark permanently deleted',
    'tag.created': isZh ? '创建标签' : 'Tag created',
    'tag.updated': isZh ? '修改标签' : 'Tag updated',
    'tag.deleted': isZh ? '删除标签' : 'Tag deleted',
    'tag.batch_deleted': isZh ? '批量删除标签' : 'Batch tag deletion',
    'tag.merged': isZh ? '合并标签' : 'Tags merged',
    batch_create_bookmarks: isZh ? '批量创建书签' : 'Batch bookmark creation',
    batch_delete_bookmarks: isZh ? '批量删除书签' : 'Batch bookmark deletion',
    batch_update_tags: isZh ? '批量更新标签' : 'Batch tag update',
    'ai.bookmarks.batch_regenerate.started': isZh ? 'AI 整理开始' : 'AI regenerate started',
    'ai.bookmarks.batch_regenerate.completed': isZh ? 'AI 整理完成' : 'AI regenerate completed',
    'ai.bookmarks.batch_regenerate.request_failed': isZh ? 'AI 请求失败' : 'AI request failed',
    'ai.bookmarks.batch_regenerate.parse_failed': isZh ? 'AI 解析失败' : 'AI parse failed',
    'ai.bookmarks.batch_regenerate.retry_started': isZh ? 'AI 自动重试开始' : 'AI retry started',
    'ai.bookmarks.batch_regenerate.retry_completed': isZh ? 'AI 自动重试完成' : 'AI retry completed',
    'ai.bookmarks.batch_regenerate.retry_failed': isZh ? 'AI 自动重试失败' : 'AI retry failed',
    'ai.bookmarks.item_generated': isZh ? 'AI 书签回复' : 'AI bookmark reply',
    'ai.bookmarks.batch_regenerate.apply_started': isZh ? '应用 AI 标签' : 'Applying AI tags',
    'ai.bookmarks.batch_regenerate.apply_completed': isZh ? 'AI 标签已应用' : 'AI tags applied',
    'ai.bookmarks.batch_regenerate.apply_failed': isZh ? '应用 AI 标签失败' : 'Applying AI tags failed',
    'ai.bookmarks.single_generate.started': isZh ? '单书签 AI 生成开始' : 'Single bookmark AI started',
    'ai.bookmarks.single_generate.completed': isZh ? '单书签 AI 生成完成' : 'Single bookmark AI completed',
    'ai.bookmarks.single_generate.request_failed': isZh ? '单书签 AI 请求失败' : 'Single bookmark AI request failed',
    'ai.bookmarks.single_generate.parse_failed': isZh ? '单书签 AI 解析失败' : 'Single bookmark AI parse failed',
    'ai.bookmarks.single_generate.apply_completed': isZh ? '单书签 AI 标签已应用' : 'Single bookmark AI tags applied',
    'ai.bookmarks.single_generate.apply_failed': isZh ? '单书签 AI 标签应用失败' : 'Single bookmark AI tags apply failed',
    'settings.ai.updated': isZh ? '更新 AI 设置' : 'AI settings updated',
    'settings.ai.test_connection': isZh ? 'AI 请求测试' : 'AI request test',
    'settings.logs.debug': isZh ? '写入调试日志' : 'Debug log written',
    'auth.login_success': isZh ? '登录成功' : 'Login succeeded',
    'auth.login_failed': isZh ? '登录失败' : 'Login failed',
    'auth.logout': isZh ? '退出登录' : 'Logged out',
    'auth.logout_all_devices': isZh ? '退出全部设备' : 'Logged out on all devices',
    'auth.token_refreshed': isZh ? '刷新令牌' : 'Token refreshed',
    'user.registered': isZh ? '用户注册' : 'User registered',
  }

  return labels[eventType] ?? eventType
}

function getFieldLabel(field: string, isZh: boolean) {
  const labels: Record<string, string> = {
    title: isZh ? '标题' : 'Title',
    url: 'URL',
    description: isZh ? '描述' : 'Description',
    cover_image: isZh ? '封面图' : 'Cover image',
    favicon: 'Favicon',
    is_pinned: isZh ? '置顶状态' : 'Pinned',
    is_public: isZh ? '公开状态' : 'Visibility',
    tags: isZh ? '标签' : 'Tags',
    provider: isZh ? '服务商' : 'Provider',
    model: isZh ? '模型' : 'Model',
    enabled: isZh ? '启用状态' : 'Enabled',
    enable_custom_prompt: isZh ? '自定义提示词' : 'Custom prompt',
    custom_prompt_length: isZh ? '提示词长度' : 'Prompt length',
    api_url: isZh ? '接口地址' : 'API URL',
    has_api_key: isZh ? 'API Key' : 'API key',
    api_key_updated: isZh ? 'API Key 更新' : 'API key update',
    tag_count: isZh ? '标签数' : 'Tag count',
    source: isZh ? '来源' : 'Source',
    triggered_at: isZh ? '触发时间' : 'Triggered at',
    username: isZh ? '用户名' : 'Username',
    reason: isZh ? '原因' : 'Reason',
    session_id: isZh ? '会话 ID' : 'Session ID',
    remember_me: isZh ? '记住登录' : 'Remember me',
    count: isZh ? '数量' : 'Count',
    bookmark_ids: isZh ? '书签 ID' : 'Bookmark IDs',
    add_tag_ids: isZh ? '新增标签' : 'Added tags',
    remove_tag_ids: isZh ? '移除标签' : 'Removed tags',
    name: isZh ? '名称' : 'Name',
    color: isZh ? '颜色' : 'Color',
    bookmark_count: isZh ? '关联书签数' : 'Bookmark count',
    target_tag: isZh ? '目标标签' : 'Target tag',
    source_tags: isZh ? '来源标签' : 'Source tags',
    matched: isZh ? '是否命中' : 'Matched',
    matched_by: isZh ? '匹配方式' : 'Matched by',
    existing_tags: isZh ? '原标签' : 'Original tags',
    generated_tags: isZh ? 'AI 标签' : 'AI tags',
    bookmarks: isZh ? '书签列表' : 'Bookmarks',
    created_tags: isZh ? '新增标签' : 'Created tags',
    selected_tags: isZh ? '当前标签' : 'Current tags',
    selected_ai_tags: isZh ? '选中的 AI 标签' : 'Selected AI tags',
    applied_tags: isZh ? '应用后标签' : 'Applied tags',
    mode: isZh ? '模式' : 'Mode',
    parsed_item_count: isZh ? '解析条数' : 'Parsed items',
    finish_reason: isZh ? '结束原因' : 'Finish reason',
    retry_from_finish_reason: isZh ? '重试触发原因' : 'Retry trigger',
    error: isZh ? '错误' : 'Error',
  }

  return labels[field] ?? field
}

function formatFieldValue(field: string, value: unknown, isZh: boolean) {
  switch (field) {
    case 'is_pinned':
      return value === true ? (isZh ? '已置顶' : 'Pinned') : value === false ? (isZh ? '未置顶' : 'Unpinned') : defaultEmptyValue(isZh)
    case 'is_public':
      return value === true ? (isZh ? '公开' : 'Public') : value === false ? (isZh ? '私有' : 'Private') : defaultEmptyValue(isZh)
    case 'enabled':
    case 'enable_custom_prompt':
      return value === true ? (isZh ? '开启' : 'Enabled') : value === false ? (isZh ? '关闭' : 'Disabled') : defaultEmptyValue(isZh)
    case 'has_api_key':
    case 'api_key_updated':
      return value === true ? (isZh ? '已填写' : 'Present') : value === false ? (isZh ? '未填写' : 'Missing') : defaultEmptyValue(isZh)
    case 'custom_prompt_length':
      return typeof value === 'number' ? (isZh ? `${value} 个字符` : `${value} chars`) : defaultEmptyValue(isZh)
    default:
      return formatGenericValue(value, isZh)
  }
}

function formatGenericValue(value: unknown, isZh: boolean): string {
  if (value == null || value === '') {
    return defaultEmptyValue(isZh)
  }

  if (typeof value === 'boolean') {
    return value ? (isZh ? '是' : 'Yes') : (isZh ? '否' : 'No')
  }

  if (typeof value === 'number') {
    return String(value)
  }

  if (typeof value === 'string') {
    return value.startsWith('http') ? truncate(value, 140) : quoteValue(value)
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return defaultEmptyValue(isZh)
    }

    const formatted = value.map((item) => formatArrayItem(item, isZh))
    const visible = formatted.slice(0, 5)
    return visible.join(isZh ? '、' : ', ') + (formatted.length > visible.length ? (isZh ? ` 等 ${formatted.length} 项` : ` and ${formatted.length - visible.length} more`) : '')
  }

  if (isRecord(value)) {
    return truncate(JSON.stringify(value), 140)
  }

  return truncate(String(value), 140)
}

function formatArrayItem(value: unknown, isZh: boolean) {
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number') {
    return String(value)
  }

  if (typeof value === 'boolean') {
    return value ? (isZh ? '是' : 'Yes') : (isZh ? '否' : 'No')
  }

  return truncate(JSON.stringify(value), 60)
}

function defaultEmptyValue(isZh: boolean) {
  return isZh ? '未设置' : 'Not set'
}

function getFirstBatchError(value: unknown) {
  const errors = getRecordArray(value)
  const first = errors[0]
  if (!first) {
    return null
  }

  return getString(first.error) || getString(first.message)
}

function isSimpleSummaryValue(value: unknown) {
  return (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    (Array.isArray(value) && value.every((item) => item == null || typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'))
  )
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function getBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
}

function getRecordArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function quoteValue(value: string) {
  return `"${truncate(value, 120)}"`
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value
}
