-- 添加通用设置字段到 user_preferences 表
-- 搜索框自动清空时间（秒）
ALTER TABLE user_preferences ADD COLUMN search_auto_clear_seconds INTEGER NOT NULL DEFAULT 15;

-- 标签选中状态自动清空时间（秒）
ALTER TABLE user_preferences ADD COLUMN tag_selection_auto_clear_seconds INTEGER NOT NULL DEFAULT 30;

-- 是否启用搜索自动清空
ALTER TABLE user_preferences ADD COLUMN enable_search_auto_clear INTEGER NOT NULL DEFAULT 1;

-- 是否启用标签选中自动清空
ALTER TABLE user_preferences ADD COLUMN enable_tag_selection_auto_clear INTEGER NOT NULL DEFAULT 0;
