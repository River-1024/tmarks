import type {
  BookmarkInput,
  Tag,
  Bookmark,
  ErrorCode
} from '@/types';
import { AppError } from '@/types';
import { StorageService } from '@/lib/utils/storage';
import { createTMarksClient, type TMarksBookmark, type TMarksTag } from '@/lib/api/tmarks';
import { getTMarksUrls } from '@/lib/constants/urls';

export class BookmarkAPIClient {
  private client: ReturnType<typeof createTMarksClient> | null = null;

  async initialize(): Promise<void> {
    const configuredUrl = await StorageService.getBookmarkSiteApiUrl();
    const apiKey = await StorageService.getBookmarkSiteApiKey();

    if (!apiKey) {
      throw new AppError(
        'API_KEY_INVALID' as ErrorCode,
        'API Key not found. Please configure your TMarks API key in the extension settings (Options page).'
      );
    }

    // 从配置的 URL 获取 API 基础地址
    // 支持两种格式：
    // 1. 基础 URL（推荐）：https://tmarks.669696.xyz -> https://tmarks.669696.xyz/api
    // 2. 完整 API URL（兼容旧版）：https://tmarks.669696.xyz/api -> https://tmarks.669696.xyz/api
    let apiBaseUrl: string;
    if (configuredUrl) {
      if (configuredUrl.endsWith('/api')) {
        // 已经是完整的 API URL
        apiBaseUrl = configuredUrl;
      } else {
        // 基础 URL，需要补全 /api
        apiBaseUrl = getTMarksUrls(configuredUrl).API_BASE;
      }
    } else {
      // 使用默认 URL
      apiBaseUrl = getTMarksUrls().API_BASE;
    }

    // Create TMarks client with proper API key
    this.client = createTMarksClient({
      apiKey,
      baseUrl: apiBaseUrl
    });
  }

  private async ensureClient(): Promise<ReturnType<typeof createTMarksClient>> {
    if (!this.client) {
      await this.initialize();
    }
    if (!this.client) {
      throw new AppError(
        'API_KEY_INVALID' as ErrorCode,
        'API Key not found. Failed to initialize TMarks client. Please configure your API key in the extension settings.'
      );
    }
    return this.client;
  }

  
  /**
   * Get all tags from bookmark site
   */
  async getTags(): Promise<Tag[]> {
    const client = await this.ensureClient();

    try {
      const response = await client.tags.getTags();

      // Convert TMarks API format to internal format
      return response.data.tags.map((tag: TMarksTag) => ({
        name: tag.name,
        color: tag.color,
        count: tag.bookmark_count || 0,
        createdAt: new Date(tag.created_at).getTime()
      }));
    } catch (error: any) {
      if (error.code === 'MISSING_API_KEY') {
        throw new AppError(
          'API_KEY_INVALID' as ErrorCode,
          'TMarks API key is required. Please configure your API key in the extension settings.',
          { originalError: error }
        );
      }
      throw new AppError(
        'BOOKMARK_SITE_ERROR' as ErrorCode,
        `Failed to fetch tags: ${error.message}`,
        { originalError: error }
      );
    }
  }

  /**
   * Get bookmarks with pagination
   */
  async getBookmarks(page: number = 1, limit: number = 100): Promise<{
    bookmarks: Bookmark[];
    hasMore: boolean;
  }> {
    const client = await this.ensureClient();

    try {
      const response = await client.bookmarks.getBookmarks({
        page_size: limit,
        page_cursor: page > 1 ? `page_${page}` : undefined
      });

      if (!response.data.bookmarks.length) {
        return { bookmarks: [], hasMore: false };
      }

      // Convert TMarks API format to internal format
      const bookmarks = response.data.bookmarks.map((bm: TMarksBookmark) => ({
        url: bm.url,
        title: bm.title,
        description: bm.description || '',
        tags: bm.tags.map((tag: TMarksTag) => tag.name), // 只保留标签名称
        createdAt: new Date(bm.created_at).getTime(),
        remoteId: bm.id,
        isPublic: bm.is_public
      }));

      return {
        bookmarks,
        hasMore: response.data.meta.has_more
      };
    } catch (error: any) {
      throw new AppError(
        'BOOKMARK_SITE_ERROR' as ErrorCode,
        `Failed to fetch bookmarks: ${error.message}`,
        { originalError: error }
      );
    }
  }

  /**
   * Add a new bookmark
   */
  async addBookmark(bookmark: BookmarkInput): Promise<{ id: string; isExisting?: boolean; existingBookmark?: any }> {
    const client = await this.ensureClient();

    try {
      // 直接传标签名称，让后端自动创建或链接标签
      const response = await client.bookmarks.createBookmark({
        title: bookmark.title,
        url: bookmark.url,
        description: bookmark.description,
        cover_image: bookmark.thumbnail,
        favicon: bookmark.favicon,
        tags: bookmark.tags,  // 直接传标签名称数组
        is_public: bookmark.isPublic ?? false
      });

      if (!response.data.bookmark) {
        throw new AppError(
          'BOOKMARK_SITE_ERROR' as ErrorCode,
          'Failed to add bookmark: No data returned'
        );
      }

      // Check if this is an existing bookmark
      const isExisting = response.meta?.code === 'BOOKMARK_EXISTS';
      if (isExisting) {
        // Return the full bookmark data for the dialog
        return { 
          id: response.data.bookmark.id,
          isExisting,
          existingBookmark: response.data.bookmark
        };
      } else {
        return { 
          id: response.data.bookmark.id,
          isExisting 
        };
      }
    } catch (error: any) {
      // 如果是 TMarksAPIError，提取更友好的错误信息
      const errorMessage = error.message || 'Unknown error';
      
      throw new AppError(
        'BOOKMARK_SITE_ERROR' as ErrorCode,
        `Failed to add bookmark: ${errorMessage}`,
        { originalError: error }
      );
    }
  }

  /**
   * Update bookmark tags
   */
  async updateBookmarkTags(bookmarkId: string, tags: string[]): Promise<void> {
    const client = await this.ensureClient();

    try {

      // 调用更新 API，直接传标签名称
      await client.bookmarks.updateBookmark(bookmarkId, {
        tags  // 后端会自动处理标签创建和链接
      });
    } catch (error: any) {
      throw new AppError(
        'BOOKMARK_SITE_ERROR' as ErrorCode,
        `Failed to update tags: ${error.message}`,
        { originalError: error }
      );
    }
  }

  /**
   * Create a snapshot for a bookmark
   */
  async createSnapshot(
    bookmarkId: string,
    data: {
      html_content: string;
      title: string;
      url: string;
    }
  ): Promise<void> {
    const client = await this.ensureClient();

    try {
      await client.snapshots.createSnapshot(bookmarkId, data);
    } catch (error: any) {
      throw new AppError(
        'BOOKMARK_SITE_ERROR' as ErrorCode,
        `Failed to create snapshot: ${error.message}`,
        { originalError: error }
      );
    }
  }

  /**
   * Create a snapshot for a bookmark (V2 - with separate images)
   */
  async createSnapshotV2(
    bookmarkId: string,
    data: {
      html_content: string;
      title: string;
      url: string;
      images: Array<{
        hash: string;
        data: string;
        type: string;
      }>;
    }
  ): Promise<void> {
    await this.ensureClient();

    try {
      // 使用 V2 API 端点
      const apiKey = await StorageService.getBookmarkSiteApiKey();
      const configuredUrl = await StorageService.getBookmarkSiteApiUrl();
      
      let apiBaseUrl: string;
      if (configuredUrl) {
        if (configuredUrl.endsWith('/api')) {
          apiBaseUrl = configuredUrl;
        } else {
          apiBaseUrl = getTMarksUrls(configuredUrl).API_BASE;
        }
      } else {
        apiBaseUrl = getTMarksUrls().API_BASE;
      }

      const response = await fetch(`${apiBaseUrl}/tab/bookmarks/${bookmarkId}/snapshots-v2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey!,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to create snapshot');
      }
    } catch (error: any) {
      throw new AppError(
        'BOOKMARK_SITE_ERROR' as ErrorCode,
        `Failed to create snapshot (V2): ${error.message}`,
        { originalError: error }
      );
    }
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const client = await this.ensureClient();
      await client.user.getMe(); // Test with a lightweight API call
      return true;
    } catch (error) {
      return false;
    }
  }
}

// Singleton instance
export const bookmarkAPI = new BookmarkAPIClient();
