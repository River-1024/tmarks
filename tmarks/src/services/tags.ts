import { apiClient } from '@/lib/api-client'
import type {
  BatchDeleteTagsRequest,
  BatchDeleteTagsResponse,
  CreateTagRequest,
  MergeTagsRequest,
  MergeTagsResponse,
  Tag,
  TagQueryParams,
  TagsResponse,
  UpdateTagRequest,
} from '@/lib/types'

export const tagsService = {
  async getTags(params?: TagQueryParams) {
    const searchParams = new URLSearchParams()

    if (params?.sort) searchParams.set('sort', params.sort)

    const query = searchParams.toString()
    const endpoint = query ? `/tags?${query}` : '/tags'

    const response = await apiClient.get<TagsResponse>(endpoint)
    return response.data!
  },

  async createTag(data: CreateTagRequest) {
    const response = await apiClient.post<{ tag: Tag }>('/tags', data)
    return response.data!.tag
  },

  async updateTag(id: string, data: UpdateTagRequest) {
    const response = await apiClient.patch<{ tag: Tag }>(`/tags/${id}`, data)
    return response.data!.tag
  },

  async deleteTag(id: string) {
    await apiClient.delete(`/tags/${id}`)
  },

  async deleteTags(ids: string[]) {
    const payload: BatchDeleteTagsRequest = { tag_ids: ids }
    const response = await apiClient.post<BatchDeleteTagsResponse>('/tags/bulk-delete', payload)
    return response.data!
  },

  async mergeTags(data: MergeTagsRequest) {
    const response = await apiClient.post<MergeTagsResponse>('/tags/merge', data)
    return response.data!
  },

  async incrementClick(id: string) {
    await apiClient.patch(`/tags/${id}/click`, {})
  },
}
