-- ============================================================================
-- 书签图片表：存储书签封面图片到 R2
-- ============================================================================

-- 书签图片表
CREATE TABLE IF NOT EXISTS bookmark_images (
  id TEXT PRIMARY KEY,
  bookmark_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  image_hash TEXT NOT NULL,           -- 图片内容哈希（用于去重）
  r2_key TEXT NOT NULL,               -- R2 存储路径
  r2_bucket TEXT NOT NULL DEFAULT 'tmarks-snapshots',
  file_size INTEGER NOT NULL,         -- 文件大小（字节）
  mime_type TEXT NOT NULL,            -- MIME 类型（image/jpeg, image/png 等）
  original_url TEXT NOT NULL,         -- 原始图片 URL
  width INTEGER,                      -- 图片宽度（可选）
  height INTEGER,                     -- 图片高度（可选）
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_bookmark_images_bookmark_id ON bookmark_images(bookmark_id);
CREATE INDEX IF NOT EXISTS idx_bookmark_images_user_id ON bookmark_images(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmark_images_hash ON bookmark_images(image_hash);
CREATE INDEX IF NOT EXISTS idx_bookmark_images_created_at ON bookmark_images(created_at DESC);

-- 为 bookmarks 表添加图片关联字段
-- 保留 cover_image 字段用于存储 R2 URL（向后兼容）
-- 添加 cover_image_id 字段用于关联 bookmark_images 表
ALTER TABLE bookmarks ADD COLUMN cover_image_id TEXT;

-- 创建外键索引
CREATE INDEX IF NOT EXISTS idx_bookmarks_cover_image_id ON bookmarks(cover_image_id);

-- 记录迁移版本
INSERT OR IGNORE INTO schema_migrations (version) VALUES ('0004');
