import { create } from 'zustand';
import type {
  PageInfo,
  TagSuggestion,
  StorageConfig,
  UserPreferences,
  Message,
  MessageResponse,
  RecommendationResult,
  SaveResult
} from '@/types';
import { StorageService } from '@/lib/utils/storage';

interface AppState {
  // Current page info
  currentPage: PageInfo | null;
  setCurrentPage: (page: PageInfo | null) => void;

  // Recommended tags from AI
  recommendedTags: TagSuggestion[];
  setRecommendedTags: (tags: TagSuggestion[]) => void;

  // Existing tags from API
  existingTags: Array<{ id: string; name: string; color: string; count: number }>;
  setExistingTags: (tags: Array<{ id: string; name: string; color: string; count: number }>) => void;
  loadExistingTags: () => Promise<void>;

  // User selected tags
  selectedTags: string[];
  toggleTag: (tagName: string) => void;
  addCustomTag: (tagName: string) => void;
  clearSelectedTags: () => void;

  // UI state
  isLoading: boolean;
  isSaving: boolean;
  isRecommending: boolean;
  setLoading: (loading: boolean) => void;

  error: string | null;
  setError: (error: string | null) => void;

  successMessage: string | null;
  setSuccessMessage: (message: string | null) => void;

  lastRecommendationSource: RecommendationResult['source'] | null;
  lastRecommendationMessage: string | null;

  lastSaveDurationMs: number | null;
  lastRecommendationDurationMs: number | null;

  isPublic: boolean;
  setIsPublic: (value: boolean) => void;

  includeThumbnail: boolean;
  setIncludeThumbnail: (value: boolean) => void;

  // Configuration
  config: StorageConfig | null;
  loadConfig: () => Promise<void>;
  saveConfig: (config: Partial<StorageConfig>) => Promise<void>;

  // Actions
  extractPageInfo: () => Promise<void>;
  recommendTags: () => Promise<void>;
  saveBookmark: () => Promise<void>;
  syncCache: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  // State
  currentPage: null,
  recommendedTags: [],
  existingTags: [],
  selectedTags: [],
  isLoading: false,
  isSaving: false,
  isRecommending: false,
  error: null,
  successMessage: null,
  lastRecommendationSource: null,
  lastRecommendationMessage: null,
  lastSaveDurationMs: null,
  lastRecommendationDurationMs: null,
  isPublic: true,
  includeThumbnail: false,
  config: null,

  // Setters
  setCurrentPage: (page) =>
    set((state) => {
      let includeThumbnail = false;

      if (page) {
        if (state.currentPage && state.currentPage.url === page.url) {
          includeThumbnail = state.includeThumbnail && Boolean(page.thumbnail);
        } else {
          includeThumbnail = Boolean(page.thumbnail);
        }
      }

      return {
        currentPage: page,
        includeThumbnail
      };
    }),
  setRecommendedTags: (tags) => set({ recommendedTags: tags }),
  setExistingTags: (tags) => set({ existingTags: tags }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setSuccessMessage: (message) => set({ successMessage: message }),
  setIsPublic: (value) => {
    const defaultVisibility: 'public' | 'private' = value ? 'public' : 'private';
    const state = get();
    const nextConfig = state.config
      ? {
          ...state.config,
          preferences: {
            ...state.config.preferences,
            defaultVisibility
          }
        }
      : state.config;

    set({
      isPublic: value,
      config: nextConfig ?? state.config
    });

    const preferencesPayload: UserPreferences = state.config
      ? { ...state.config.preferences, defaultVisibility }
      : {
          theme: 'auto',
          autoSync: true,
          syncInterval: 24,
          maxSuggestedTags: 5,
          defaultVisibility
        };

    StorageService.saveConfig({
      preferences: preferencesPayload
    }).catch((error) => {
      console.error('Failed to persist visibility preference:', error);
    });
  },
  setIncludeThumbnail: (value) => set({ includeThumbnail: value }),

  // Tag management
  toggleTag: (tagName) =>
    set((state) => ({
      selectedTags: state.selectedTags.includes(tagName)
        ? state.selectedTags.filter((t) => t !== tagName)
        : [...state.selectedTags, tagName]
    })),

  addCustomTag: (tagName) =>
    set((state) => {
      // Check if tag already exists
      if (
        state.selectedTags.includes(tagName) ||
        state.recommendedTags.some((t) => t.name === tagName)
      ) {
        return state;
      }

      return {
        selectedTags: [...state.selectedTags, tagName],
        recommendedTags: [
          ...state.recommendedTags,
          { name: tagName, isNew: true, confidence: 1.0 }
        ]
      };
    }),

  clearSelectedTags: () => set({ selectedTags: [] }),

  // Existing tags management
  loadExistingTags: async () => {
    try {
      const tags = await sendMessage<Array<{ id: string; name: string; color: string; count: number }>>({
        type: 'GET_EXISTING_TAGS'
      });
      set({ existingTags: tags });
    } catch (error) {
      console.error('Failed to load existing tags:', error);
      // Don't set error state as this is not critical
    }
  },

  // Config management
  loadConfig: async () => {
    try {
      const config = await StorageService.loadConfig();
      set({
        config,
        isPublic: config.preferences.defaultVisibility === 'public'
      });
    } catch (error) {
      console.error('Failed to load config:', error);
      set({ error: 'Failed to load configuration' });
    }
  },

  saveConfig: async (partialConfig) => {
    try {
      await StorageService.saveConfig(partialConfig);
      const config = await StorageService.loadConfig();
      set({
        config,
        isPublic: config.preferences.defaultVisibility === 'public'
      });
    } catch (error) {
      console.error('Failed to save config:', error);
      set({ error: 'Failed to save configuration' });
    }
  },

  // Actions
  extractPageInfo: async () => {
    try {
      set({ isLoading: true, error: null });
      const { config } = get();
      const defaultVisibility = config?.preferences.defaultVisibility ?? 'public';

      const response = await sendMessage<PageInfo>({
        type: 'EXTRACT_PAGE_INFO'
      });

      set({
        currentPage: response,
        isLoading: false,
        isPublic: defaultVisibility === 'public',
        includeThumbnail: Boolean(response.thumbnail)
      });
    } catch (error) {
      console.error('Failed to extract page info:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to extract page info',
        isLoading: false
      });
    }
  },

  recommendTags: async () => {
    const { currentPage } = get();

    if (!currentPage) {
      set({ error: 'No page info available' });
      return;
    }

    const startTime = Date.now();

    try {
      set({
        isLoading: true,
        isRecommending: true,
        error: null,
        lastRecommendationSource: null,
        lastRecommendationMessage: null,
        lastRecommendationDurationMs: null
      });

      const result = await sendMessage<RecommendationResult>({
        type: 'RECOMMEND_TAGS',
        payload: currentPage
      });

      const endTime = Date.now();
      const elapsedMs = endTime - startTime;

      // Auto-select all recommended tags (including new tags)
      const autoSelectedTags = result.tags.map((t) => t.name);

      const baseState = {
        recommendedTags: result.tags,
        selectedTags: autoSelectedTags,
        isLoading: false,
        isRecommending: false,
        lastRecommendationSource: result.source,
        lastRecommendationMessage: result.message || null,
        lastRecommendationDurationMs: elapsedMs
      };

      if (result.source === 'fallback') {
        set({
          ...baseState,
          error: result.message
            ? `AI 推荐失败：${result.message}。已使用本地推荐标签，可重试。`
            : 'AI 推荐失败，已使用本地推荐标签，可重试。'
        });
      } else {
        set({
          ...baseState,
          error: null
        });

        const aiMessage = `🎯 AI 推荐完成（耗时 ${(elapsedMs / 1000).toFixed(2)}s）`;
        set({ successMessage: aiMessage });
        setTimeout(() => {
          if (get().successMessage === aiMessage) {
            set({ successMessage: null });
          }
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to recommend tags:', error);
      const elapsedMs = Date.now() - startTime;
      set({
        error: error instanceof Error ? error.message : 'Failed to recommend tags',
        isLoading: false,
        isRecommending: false,
        lastRecommendationSource: null,
        lastRecommendationMessage: null,
        lastRecommendationDurationMs: elapsedMs
      });
    }
  },

  saveBookmark: async () => {
    const { currentPage, selectedTags, isPublic, includeThumbnail } = get();

    if (!currentPage) {
      set({ error: 'No page info available' });
      return;
    }

    // AI 书签助手的核心功能是标签推荐，必须至少有一个标签
    if (selectedTags.length === 0) {
      set({ error: '请至少选择一个标签' });
      return;
    }

    const startTime = Date.now();

    try {
      set({ isLoading: true, isSaving: true, error: null });

      console.log('[Store] 保存书签，选中的标签:', selectedTags);

      const result = await sendMessage<SaveResult>({
        type: 'SAVE_BOOKMARK',
        payload: {
          url: currentPage.url,
          title: currentPage.title,
          description: currentPage.description,
          tags: selectedTags,
          thumbnail: includeThumbnail ? currentPage.thumbnail : undefined,
          isPublic
        }
      });

      const endTime = Date.now();
      const elapsedMs = endTime - startTime;
      const formattedSeconds = (elapsedMs / 1000).toFixed(2);
      console.log(`[Store] 书签保存耗时: ${formattedSeconds}s (${elapsedMs.toFixed(0)}ms)`);

      // Check if save was successful
      if (!result.success) {
      set({
        error:
          `${result.message || result.error || '保存失败'}（耗时 ${formattedSeconds}s）`,
          isLoading: false,
          isSaving: false,
        lastSaveDurationMs: elapsedMs
      });
        return;
      }

      let toastMessage: string;

      if (result.offline) {
        toastMessage = `${result.message || '书签已离线保存'}（保存耗时 ${formattedSeconds}s）`;
        set({
          successMessage: toastMessage,
          isLoading: false,
          isSaving: false,
        lastSaveDurationMs: elapsedMs
        });

        // Show notification
        chrome.notifications.create({
          type: 'basic',
          iconUrl: '/icons/icon-128.png',
          title: 'AI 书签助手',
          message: `${result.message || '书签已离线保存'}（耗时 ${formattedSeconds}s）`
        });
      } else {
        toastMessage = `✅ 书签保存成功！（保存耗时 ${formattedSeconds}s）`;
        set({
          successMessage: toastMessage,
          isLoading: false,
          isSaving: false,
          lastSaveDurationMs: elapsedMs
        });

        // Show success notification
        chrome.notifications.create({
          type: 'basic',
          iconUrl: '/icons/icon-128.png',
          title: 'AI 书签助手',
          message: `《${currentPage.title}》已成功保存到书签（耗时 ${formattedSeconds}s）`
        });
      }

      // Clear selection after successful save
      const toastSnapshot = toastMessage;
      setTimeout(() => {
        if (get().successMessage === toastSnapshot) {
          set({ successMessage: null });
        }
      }, 2000);
    } catch (error) {
      const failureTime = Date.now();
      const elapsedMs = failureTime - startTime;
      const formattedSeconds = (elapsedMs / 1000).toFixed(2);
      console.error('Failed to save bookmark:', error);
      set({
        error:
          `${error instanceof Error ? error.message : 'Failed to save bookmark'}（耗时 ${formattedSeconds}s）`,
        isLoading: false,
        isSaving: false,
        lastSaveDurationMs: elapsedMs
      });
    }
  },

  syncCache: async () => {
    try {
      set({ isLoading: true, error: null });

      await sendMessage({
        type: 'SYNC_CACHE'
      });

      set({
        successMessage: 'Cache synced successfully!',
        isLoading: false
      });

      setTimeout(() => {
        set({ successMessage: null });
      }, 2000);
    } catch (error) {
      console.error('Failed to sync cache:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to sync cache',
        isLoading: false
      });
    }
  }
}));

/**
 * Helper function to send messages to background script
 */
async function sendMessage<T = any>(message: Message): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: MessageResponse<T>) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!response.success) {
        reject(new Error(response.error || 'Unknown error'));
        return;
      }

      resolve(response.data as T);
    });
  });
}
