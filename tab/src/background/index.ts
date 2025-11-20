import { cacheManager } from '@/lib/services/cache-manager';
import { tagRecommender } from '@/lib/services/tag-recommender';
import { bookmarkService } from '@/lib/services/bookmark-service';
import { bookmarkAPI } from '@/lib/services/bookmark-api';
import { StorageService } from '@/lib/utils/storage';
import type { Message, MessageResponse } from '@/types';

/**
 * Background service worker for Chrome Extension
 */

console.log('[Background] Service worker started');

tagRecommender.preloadContext().catch(error => {
  console.error('[Background] Failed to preload AI context:', error);
});

// Initialize on install
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Background] Extension installed:', details.reason);

  if (details.reason === 'install') {
    // First time install - maybe show welcome page
    console.log('[Background] First time install');
  } else if (details.reason === 'update') {
    // Extension updated
    console.log('[Background] Extension updated');
  }
});

// Auto-sync cache periodically
function getMsUntilNextDailySync(): number {
  const now = new Date();
  const target = new Date(now);
  target.setHours(23, 0, 0, 0);

  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  return target.getTime() - now.getTime();
}

async function runAutoSync() {
  try {
    const config = await StorageService.loadConfig();
    if (!config.preferences.autoSync) {
      return;
    }

    console.log('[Background] Running scheduled auto-sync (23:00)...');
    const result = await cacheManager.autoSync(config.preferences.syncInterval);

    if (result) {
      console.log('[Background] Auto-sync result:', result);
    }
  } catch (error) {
    console.error('[Background] Auto-sync failed:', error);
  }
}

async function startAutoSync() {
  const scheduleNext = () => {
    const delay = getMsUntilNextDailySync();
    console.log('[Background] Next auto-sync scheduled in', Math.round(delay / 1000), 'seconds');

    setTimeout(async () => {
      await runAutoSync();
      scheduleNext();
    }, delay);
  };

  scheduleNext();
}

// Start auto-sync
startAutoSync().catch(console.error);

// Sync pending bookmarks on startup
bookmarkService.syncPendingBookmarks().catch(console.error);

// Handle messages from popup/content scripts
chrome.runtime.onMessage.addListener(
  (
    message: Message,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => {
    // Handle async operations
    handleMessage(message, sender)
      .then(response => sendResponse(response))
      .catch(error => {
        console.error('[Background] Message handler error:', error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });

    // Return true to indicate async response
    return true;
  }
);

/**
 * Handle messages from popup/content scripts
 */
async function handleMessage(
  message: Message,
  _sender: chrome.runtime.MessageSender
): Promise<MessageResponse> {
  console.log('[Background] Received message:', message.type);

  switch (message.type) {
    case 'EXTRACT_PAGE_INFO': {
      // 获取当前活动标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !tab.id) {
        throw new Error('No active tab found');
      }

      // 检查URL是否可访问（排除chrome://等特殊页面）
      const url = tab.url || '';
      if (url.startsWith('chrome://') || 
          url.startsWith('chrome-extension://') || 
          url.startsWith('edge://') ||
          url.startsWith('about:') ||
          !url) {
        console.warn('[Background] Cannot access special page:', url);
        return {
          success: true,
          data: {
            title: tab.title || 'Untitled',
            url: url,
            description: '',
            content: '',
            thumbnail: ''
          }
        };
      }

      // 辅助函数：带超时的消息发送
      const sendMessageWithTimeout = async (tabId: number, msg: Message, timeoutMs: number = 3000): Promise<MessageResponse> => {
        return Promise.race([
          chrome.tabs.sendMessage(tabId, msg),
          new Promise<MessageResponse>((_, reject) => 
            setTimeout(() => reject(new Error('Message timeout')), timeoutMs)
          )
        ]);
      };

      // 辅助函数：获取基本页面信息作为fallback
      const getBasicPageInfo = async (tabId: number) => {
        try {
          const currentTab = await chrome.tabs.get(tabId);
          return {
            success: true,
            data: {
              title: currentTab.title || 'Untitled',
              url: currentTab.url || '',
              description: '',
              content: '',
              thumbnail: ''
            }
          };
        } catch (error) {
          console.error('[Background] Failed to get tab info:', error);
          return {
            success: true,
            data: {
              title: 'Untitled',
              url: url,
              description: '',
              content: '',
              thumbnail: ''
            }
          };
        }
      };

      // 步骤1: 检测content script是否存活
      let isContentScriptAlive = false;
      try {
        await sendMessageWithTimeout(tab.id, { type: 'PING' }, 1000);
        isContentScriptAlive = true;
        console.log('[Background] Content script is alive');
      } catch (pingError) {
        console.warn('[Background] Content script not responding:', pingError);
      }

      // 步骤2: 如果content script不存在，尝试注入
      if (!isContentScriptAlive) {
        try {
          console.log('[Background] Attempting to inject content script...');
          
          // 获取manifest中的content script配置
          const manifest = chrome.runtime.getManifest();
          const contentScripts = manifest.content_scripts?.[0];
          
          if (!contentScripts || !contentScripts.js || contentScripts.js.length === 0) {
            console.error('[Background] Content script configuration not found in manifest');
            return await getBasicPageInfo(tab.id);
          }

          const scriptPath = contentScripts.js[0];
          console.log('[Background] Injecting content script from:', scriptPath);
          
          // 注入content script
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: [scriptPath]
          });

          // 等待脚本初始化，并验证注入是否成功
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // 验证注入是否成功
          try {
            await sendMessageWithTimeout(tab.id, { type: 'PING' }, 1000);
            isContentScriptAlive = true;
            console.log('[Background] Content script injected successfully');
          } catch (verifyError) {
            console.error('[Background] Content script injection verification failed:', verifyError);
            return await getBasicPageInfo(tab.id);
          }
        } catch (injectError) {
          const errorMessage = injectError instanceof Error ? injectError.message : 'Unknown error';
          console.error('[Background] Failed to inject content script:', errorMessage);
          
          // 检查是否是权限问题
          if (errorMessage.includes('Cannot access')) {
            console.warn('[Background] No permission to inject script on this page');
          }
          
          return await getBasicPageInfo(tab.id);
        }
      }

      // 步骤3: 发送实际的提取请求
      if (isContentScriptAlive) {
        try {
          console.log('[Background] Sending EXTRACT_PAGE_INFO request...');
          const response = await sendMessageWithTimeout(tab.id, message, 5000);
          
          // 验证响应数据的完整性
          if (response.success && response.data) {
            console.log('[Background] Successfully extracted page info');
            return response;
          } else {
            console.warn('[Background] Invalid response from content script:', response);
            return await getBasicPageInfo(tab.id);
          }
        } catch (extractError) {
          console.error('[Background] Failed to extract page info:', extractError);
          return await getBasicPageInfo(tab.id);
        }
      }

      // 步骤4: 最终fallback
      console.warn('[Background] All extraction attempts failed, returning basic info');
      return await getBasicPageInfo(tab.id);
    }

    case 'RECOMMEND_TAGS': {
      const pageInfo = message.payload;
      const result = await tagRecommender.recommendTags(pageInfo);

      return {
        success: true,
        data: result
      };
    }

    case 'SAVE_BOOKMARK': {
      const bookmark = message.payload;
      const result = await bookmarkService.saveBookmark(bookmark);

      return {
        success: true,
        data: result
      };
    }

    case 'SYNC_CACHE': {
      const result = await cacheManager.fullSync();

      return {
        success: result.success,
        data: result,
        error: result.error
      };
    }

    case 'GET_EXISTING_TAGS': {
      try {
        const tags = await bookmarkAPI.getTags();
        return {
          success: true,
          data: tags
        };
      } catch (error) {
        console.error('[Background] Failed to get existing tags:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to load tags'
        };
      }
    }

    case 'GET_CONFIG': {
      const config = await StorageService.loadConfig();

      return {
        success: true,
        data: config
      };
    }

    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

// Handle extension icon click (optional)
chrome.action.onClicked.addListener(async (tab) => {
  console.log('[Background] Extension icon clicked for tab:', tab.id);
  // The popup will open automatically due to manifest.json configuration
});

console.log('[Background] Service worker initialized');
