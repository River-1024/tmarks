-- ============================================================================
-- TMarks 完整数据库结构
-- 更新日期: 2024-11
-- ============================================================================

-- ============================================================================
-- 用户系统
-- ============================================================================

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    -- 公开分享设置
    public_share_enabled INTEGER NOT NULL DEFAULT 0,
    public_slug TEXT,
    public_page_title TEXT,
    public_page_description TEXT,
    -- 时间戳
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users(LOWER(username));
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_slug ON users(public_slug) WHERE public_slug IS NOT NULL;

-- 认证令牌表
CREATE TABLE IF NOT EXISTS auth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    refresh_token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_id ON auth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires ON auth_tokens(expires_at);

-- 用户偏好设置表
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id TEXT PRIMARY KEY,
    -- 界面设置
    theme TEXT NOT NULL DEFAULT 'light',
    page_size INTEGER NOT NULL DEFAULT 30,
    view_mode TEXT NOT NULL DEFAULT 'list',
    density TEXT NOT NULL DEFAULT 'normal',
    tag_layout TEXT NOT NULL DEFAULT 'grid',
    sort_by TEXT NOT NULL DEFAULT 'popular',
    -- 自动清除设置
    search_auto_clear_seconds INTEGER NOT NULL DEFAULT 15,
    tag_selection_auto_clear_seconds INTEGER NOT NULL DEFAULT 30,
    enable_search_auto_clear INTEGER NOT NULL DEFAULT 1,
    enable_tag_selection_auto_clear INTEGER NOT NULL DEFAULT 0,
    -- 书签默认设置
    default_bookmark_icon TEXT NOT NULL DEFAULT 'gradient-glow',
    -- 快照设置
    snapshot_retention_count INTEGER NOT NULL DEFAULT 5,
    snapshot_auto_create INTEGER NOT NULL DEFAULT 0,
    snapshot_auto_dedupe INTEGER NOT NULL DEFAULT 1,
    snapshot_auto_cleanup_days INTEGER NOT NULL DEFAULT 0,
    -- 时间戳
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- 书签系统
-- ============================================================================

-- 书签表
CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT,
    -- 封面和图标
    cover_image TEXT,
    cover_image_id TEXT,
    favicon TEXT,
    -- 状态标记
    is_pinned INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    is_public INTEGER NOT NULL DEFAULT 0,
    -- 点击统计
    click_count INTEGER NOT NULL DEFAULT 0,
    last_clicked_at TEXT,
    -- 快照信息
    has_snapshot INTEGER NOT NULL DEFAULT 0,
    latest_snapshot_at TEXT,
    snapshot_count INTEGER NOT NULL DEFAULT 0,
    -- 时间戳
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, url)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_created ON bookmarks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_url ON bookmarks(user_id, url);
CREATE INDEX IF NOT EXISTS idx_bookmarks_url ON bookmarks(url);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_deleted ON bookmarks(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_bookmarks_pinned ON bookmarks(user_id, is_pinned, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_click_count ON bookmarks(user_id, click_count DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_last_clicked ON bookmarks(user_id, last_clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_archived_created ON bookmarks(user_id, is_archived, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_archived_updated ON bookmarks(user_id, is_archived, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_archived_pinned_created ON bookmarks(user_id, is_archived, is_pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_archived_pinned_updated ON bookmarks(user_id, is_archived, is_pinned DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_archived_pinned_clicks ON bookmarks(user_id, is_archived, is_pinned DESC, click_count DESC, last_clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_deleted_created ON bookmarks(user_id, deleted_at, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bookmarks_has_snapshot ON bookmarks(user_id, has_snapshot, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_cover_image_id ON bookmarks(cover_image_id);

-- 标签表
CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT,
    -- 点击统计
    click_count INTEGER NOT NULL DEFAULT 0,
    last_clicked_at TEXT,
    -- 时间戳
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tags_user_name ON tags(user_id, LOWER(name));
CREATE INDEX IF NOT EXISTS idx_tags_user_deleted ON tags(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_tags_click_count ON tags(user_id, click_count DESC);
CREATE INDEX IF NOT EXISTS idx_tags_last_clicked ON tags(user_id, last_clicked_at DESC);

-- 书签-标签关联表
CREATE TABLE IF NOT EXISTS bookmark_tags (
    bookmark_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (bookmark_id, tag_id),
    FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bookmark_tags_tag_user ON bookmark_tags(tag_id, user_id);
CREATE INDEX IF NOT EXISTS idx_bookmark_tags_bookmark ON bookmark_tags(bookmark_id);


-- ============================================================================
-- 快照系统
-- ============================================================================

-- 书签快照表
CREATE TABLE IF NOT EXISTS bookmark_snapshots (
    id TEXT PRIMARY KEY,
    bookmark_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    is_latest INTEGER NOT NULL DEFAULT 0,
    -- 存储信息
    content_hash TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    r2_bucket TEXT NOT NULL DEFAULT 'tmarks-snapshots',
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'text/html',
    -- 快照元数据
    snapshot_url TEXT NOT NULL,
    snapshot_title TEXT NOT NULL,
    snapshot_status TEXT NOT NULL DEFAULT 'completed',
    -- 时间戳
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bookmark_snapshots_bookmark_id ON bookmark_snapshots(bookmark_id);
CREATE INDEX IF NOT EXISTS idx_bookmark_snapshots_user_id ON bookmark_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmark_snapshots_created_at ON bookmark_snapshots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmark_snapshots_content_hash ON bookmark_snapshots(content_hash);
CREATE INDEX IF NOT EXISTS idx_bookmark_snapshots_bookmark_latest ON bookmark_snapshots(bookmark_id, is_latest DESC);
CREATE INDEX IF NOT EXISTS idx_bookmark_snapshots_bookmark_version ON bookmark_snapshots(bookmark_id, version DESC);

-- 书签图片表
CREATE TABLE IF NOT EXISTS bookmark_images (
    id TEXT PRIMARY KEY,
    bookmark_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    -- 存储信息
    image_hash TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    r2_bucket TEXT NOT NULL DEFAULT 'tmarks-snapshots',
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    -- 图片元数据
    original_url TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    -- 时间戳
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bookmark_images_bookmark_id ON bookmark_images(bookmark_id);
CREATE INDEX IF NOT EXISTS idx_bookmark_images_user_id ON bookmark_images(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmark_images_hash ON bookmark_images(image_hash);
CREATE INDEX IF NOT EXISTS idx_bookmark_images_created_at ON bookmark_images(created_at DESC);

-- ============================================================================
-- API 密钥系统
-- ============================================================================

-- API Keys 表
CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    permissions TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    expires_at TEXT,
    last_used_at TEXT,
    last_used_ip TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(user_id, status);

-- API Key 使用日志表
CREATE TABLE IF NOT EXISTS api_key_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    status INTEGER NOT NULL,
    ip TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_logs_key ON api_key_logs(api_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_user ON api_key_logs(user_id, created_at DESC);

-- ============================================================================
-- 标签页组系统 (OneTab 功能)
-- ============================================================================

-- 标签页组表
CREATE TABLE IF NOT EXISTS tab_groups (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    parent_id TEXT DEFAULT NULL,
    is_folder INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    color TEXT DEFAULT NULL,
    tags TEXT DEFAULT NULL,
    -- 软删除
    is_deleted INTEGER NOT NULL DEFAULT 0,
    deleted_at TEXT DEFAULT NULL,
    -- 时间戳
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tab_groups_user_created ON tab_groups(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tab_groups_user_id ON tab_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_tab_groups_parent_id ON tab_groups(parent_id);
CREATE INDEX IF NOT EXISTS idx_tab_groups_is_folder ON tab_groups(is_folder);
CREATE INDEX IF NOT EXISTS idx_tab_groups_user_parent ON tab_groups(user_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_tab_groups_parent_position ON tab_groups(parent_id, position ASC);
CREATE INDEX IF NOT EXISTS idx_tab_groups_user_parent_position ON tab_groups(user_id, parent_id, position ASC);
CREATE INDEX IF NOT EXISTS idx_tab_groups_deleted ON tab_groups(user_id, is_deleted);

-- 标签页项表
CREATE TABLE IF NOT EXISTS tab_group_items (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    favicon TEXT,
    position INTEGER NOT NULL,
    -- 状态标记
    is_pinned INTEGER NOT NULL DEFAULT 0,
    is_todo INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    -- 时间戳
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (group_id) REFERENCES tab_groups(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tab_group_items_group_id ON tab_group_items(group_id, position ASC);
CREATE INDEX IF NOT EXISTS idx_tab_group_items_group_created ON tab_group_items(group_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_tab_group_items_pinned ON tab_group_items(group_id, is_pinned DESC, position ASC);
CREATE INDEX IF NOT EXISTS idx_tab_group_items_archived ON tab_group_items(group_id, is_archived, position ASC);
CREATE INDEX IF NOT EXISTS idx_tab_group_items_not_archived ON tab_group_items(group_id, is_archived) WHERE is_archived = 0;

-- ============================================================================
-- 分享和统计系统
-- ============================================================================

-- 分享表
CREATE TABLE IF NOT EXISTS shares (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    share_token TEXT NOT NULL UNIQUE,
    is_public INTEGER DEFAULT 1,
    view_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT DEFAULT NULL,
    FOREIGN KEY (group_id) REFERENCES tab_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(share_token);
CREATE INDEX IF NOT EXISTS idx_shares_group_id ON shares(group_id);
CREATE INDEX IF NOT EXISTS idx_shares_user_id ON shares(user_id);

-- 统计表
CREATE TABLE IF NOT EXISTS statistics (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    stat_date TEXT NOT NULL,
    groups_created INTEGER DEFAULT 0,
    groups_deleted INTEGER DEFAULT 0,
    items_added INTEGER DEFAULT 0,
    items_deleted INTEGER DEFAULT 0,
    shares_created INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_statistics_user_date ON statistics(user_id, stat_date);
CREATE INDEX IF NOT EXISTS idx_statistics_user_id ON statistics(user_id);
CREATE INDEX IF NOT EXISTS idx_statistics_date ON statistics(stat_date);

-- ============================================================================
-- 系统管理
-- ============================================================================

-- 审计日志表
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    event_type TEXT NOT NULL,
    payload TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event ON audit_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- 注册限制表
CREATE TABLE IF NOT EXISTS registration_limits (
    date TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 迁移记录表
CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO schema_migrations (version) VALUES ('0001');
