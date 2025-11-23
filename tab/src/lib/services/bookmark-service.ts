import { db } from '@/lib/db';
import { bookmarkAPI } from './bookmark-api';
import { tagRecommender } from './tag-recommender';
import type { BookmarkInput, SaveResult } from '@/types';

export class BookmarkService {
  /**
   * Save bookmark to remote and local cache
   */
  async saveBookmark(bookmark: BookmarkInput): Promise<SaveResult> {
    let bookmarkId: string | undefined;
    let isExisting = false;

    try {
      // 1. Save to remote API
      const result = await bookmarkAPI.addBookmark(bookmark);
      bookmarkId = result.id;
      isExisting = result.isExisting || false;

      // If bookmark exists, return it for the dialog
      if (isExisting && result.existingBookmark) {
        return {
          success: true,
          existingBookmark: {
            ...result.existingBookmark,
            needsDialog: true
          },
          message: '书签已存在'
        };
      }

      // 2. Save to local cache (only for new bookmarks)
      if (!isExisting) {
        await db.bookmarks.add({
          url: bookmark.url,
          title: bookmark.title,
          description: bookmark.description,
          tags: bookmark.tags,
          createdAt: Date.now(),
          remoteId: result.id,
          isPublic: bookmark.isPublic ?? false
        });

        // 3. Update tag usage counts
        await this.updateTagCounts(bookmark.tags);

        // 4. Update in-memory context cache for AI
        tagRecommender.updateContextWithBookmark({
          title: bookmark.title,
          tags: bookmark.tags
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Check if it's a network error
      if (errorMessage.includes('Network')) {
        // Queue for later sync
        await this.queueForLaterSync(bookmark);

        return {
          success: true,
          offline: true,
          message: '已暂存,将在网络恢复后同步'
        };
      }
      
      // For other errors, throw
      throw error;
    }

    // 5. Create snapshot if requested (works for both new and existing bookmarks)
    if (bookmark.createSnapshot && bookmarkId) {
      try {
        // Get the current tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
          // Capture page using V2 method (separate images)
          let captureResult: { html: string; images: any[] };
          try {
            const capturePromise = chrome.tabs.sendMessage(tab.id, {
              type: 'CAPTURE_PAGE_V2',
              options: {
                inlineCSS: true,
                extractImages: true,
                inlineFonts: false,
                removeScripts: true,
                removeHiddenElements: false,
                maxImageSize: 100 * 1024 * 1024, // 提高到 100MB
                timeout: 30000
              }
            });
            
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Capture timeout')), 35000);
            });
            
            const response = await Promise.race([capturePromise, timeoutPromise]) as any;
            
            if (response.success) {
              captureResult = response.data;
            } else {
              throw new Error(response.error || 'Capture failed');
            }
          } catch (error) {
            throw error;
          }
          
          // Prepare images for upload
          const images = captureResult.images.map((img: any) => ({
            hash: img.hash,
            data: img.data, // base64
            type: img.type,
          }));

          // Create snapshot via V2 API
          await bookmarkAPI.createSnapshotV2(bookmarkId, {
            html_content: captureResult.html,
            title: bookmark.title,
            url: bookmark.url,
            images,
          });
        }
      } catch (snapshotError) {
        // Don't fail the whole operation if snapshot creation fails
      }
    }

    return {
      success: true,
      bookmarkId: bookmarkId,
      message: isExisting ? '书签已存在，已为其创建新快照' : undefined
    };
  }

  /**
   * Update tag usage counts in cache
   */
  private async updateTagCounts(tagNames: string[]): Promise<void> {
    for (const tagName of tagNames) {
      const existingTag = await db.tags.where('name').equals(tagName).first();

      if (existingTag && existingTag.id) {
        // Increment count
        await db.tags.update(existingTag.id, {
          count: (existingTag.count || 0) + 1
        });
      } else {
        // Create new tag
        await db.tags.add({
          name: tagName,
          count: 1,
          createdAt: Date.now()
        });
      }
    }
  }

  /**
   * Queue bookmark for later sync (offline mode)
   */
  private async queueForLaterSync(bookmark: BookmarkInput): Promise<void> {
    await db.metadata.add({
      key: `pending_${Date.now()}`,
      value: bookmark,
      updatedAt: Date.now()
    });
  }

  /**
   * Sync pending bookmarks (when back online)
   */
  async syncPendingBookmarks(): Promise<number> {
    const pending = await db.metadata
      .where('key')
      .startsWith('pending_')
      .toArray();

    let synced = 0;

    for (const item of pending) {
      try {
        // Type guard to ensure item.value is BookmarkInput
        if (item.value && typeof item.value === 'object' && 'url' in item.value && 'title' in item.value) {
          const bookmark = item.value as BookmarkInput;
          await bookmarkAPI.addBookmark(bookmark);
          await db.metadata.delete(item.key);
          synced++;
        }
      } catch (error) {
        // Silently handle error
      }
    }

    return synced;
  }

  /**
   * Get pending bookmarks count
   */
  async getPendingCount(): Promise<number> {
    const pending = await db.metadata
      .where('key')
      .startsWith('pending_')
      .count();

    return pending;
  }
}

// Singleton instance
export const bookmarkService = new BookmarkService();
