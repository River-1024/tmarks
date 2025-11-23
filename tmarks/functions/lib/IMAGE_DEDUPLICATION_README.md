# 封面图哈希去重功能说明

## 功能概述

通过独立的 `bookmark_images` 表和 SHA-256 哈希算法，实现封面图的智能去重，节省 R2 存储空间和带宽成本。

## 数据库结构

### bookmark_images 表

```sql
CREATE TABLE bookmark_images (
  id TEXT PRIMARY KEY,
  bookmark_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  image_hash TEXT NOT NULL,           -- SHA-256 哈希（用于去重）
  r2_key TEXT NOT NULL,               -- R2 存储路径
  r2_bucket TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  original_url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE
);
```

### bookmarks 表新增字段

```sql
ALTER TABLE bookmarks ADD COLUMN cover_image_id TEXT;
```

- `cover_image` - 存储 R2 URL（向后兼容）
- `cover_image_id` - 关联 bookmark_images 表

## 哈希去重工作流程

```
1. 用户上传图片 URL
   ↓
2. 下载图片并计算 SHA-256 哈希
   ↓
3. 查询数据库：SELECT * FROM bookmark_images WHERE image_hash = ?
   ↓
   找到 → 复用现有记录（isReused: true）
   ↓
   未找到 → 上传到 R2 并创建新记录
   ↓
4. 保存 cover_image_id 到 bookmarks 表
```

## 存储路径优化

### 旧方案（无去重）
```
bookmarks/{userId}/{bookmarkId}/cover.jpg
```
- 每个书签一个文件
- 相同图片重复存储

### 新方案（哈希去重）
```
images/{imageHash}.jpg
```
- 使用哈希作为文件名
- 相同图片只存储一次
- 多个书签可以共享同一个图片

## 级联删除策略

### 删除书签时

```typescript
// 1. 删除书签记录（自动触发 ON DELETE CASCADE）
DELETE FROM bookmarks WHERE id = ?

// 2. bookmark_images 记录自动删除（外键约束）

// 3. 检查 R2 文件是否还被其他书签使用
SELECT COUNT(*) FROM bookmark_images WHERE image_hash = ?

// 4. 如果没有其他书签使用，删除 R2 文件
if (count === 0) {
  await bucket.delete(r2Key)
}
```

### 清理孤立图片

```typescript
// 定期运行清理任务
await cleanupOrphanedImages(db, bucket)
```

## 去重效果示例

### 场景：100 个用户保存了相同的热门图片

**无去重：**
- 存储：100 × 200KB = 20MB
- 写入次数：100 次

**有去重：**
- 存储：1 × 200KB = 200KB
- 写入次数：1 次（首次）+ 99 次数据库记录

**节省：**
- 存储空间：99%
- R2 写入：99%
- 成本节省：显著

## API 响应示例

### 首次上传（新图片）

```json
{
  "success": true,
  "imageId": "uuid-1234",
  "r2Url": "https://r2.tmarks.app/images/abc123...def.jpg",
  "imageHash": "abc123...def",
  "fileSize": 204800,
  "mimeType": "image/jpeg",
  "isReused": false
}
```

### 复用已存在的图片

```json
{
  "success": true,
  "imageId": "uuid-5678",
  "r2Url": "https://r2.tmarks.app/images/abc123...def.jpg",
  "imageHash": "abc123...def",
  "fileSize": 204800,
  "mimeType": "image/jpeg",
  "isReused": true  // 复用标记
}
```

## 性能优化

### 索引

```sql
CREATE INDEX idx_bookmark_images_hash ON bookmark_images(image_hash);
CREATE INDEX idx_bookmark_images_bookmark_id ON bookmark_images(bookmark_id);
CREATE INDEX idx_bookmarks_cover_image_id ON bookmarks(cover_image_id);
```

### 查询优化

- 哈希查询：O(1) 时间复杂度（索引）
- 避免重复上传：节省网络带宽
- 减少 R2 写入：降低成本

## 迁移说明

### 运行迁移

```bash
# 应用迁移文件
wrangler d1 execute tmarks-db --file=migrations/0004_bookmark_images.sql
```

### 迁移现有数据（可选）

如果需要迁移现有的 `cover_image` 数据：

```sql
-- 1. 为每个现有的 cover_image 创建 bookmark_images 记录
-- 2. 更新 bookmarks.cover_image_id
-- 注意：无法计算已存在图片的哈希，所以无法去重旧数据
```

**建议：** 不迁移旧数据，只对新上传的图片启用去重。

## 监控和维护

### 查看去重效果

```sql
-- 查看被多个书签共享的图片
SELECT 
  image_hash,
  COUNT(*) as usage_count,
  file_size
FROM bookmark_images
GROUP BY image_hash
HAVING COUNT(*) > 1
ORDER BY usage_count DESC;
```

### 查看存储统计

```sql
-- 总图片数
SELECT COUNT(*) FROM bookmark_images;

-- 唯一图片数（去重后）
SELECT COUNT(DISTINCT image_hash) FROM bookmark_images;

-- 节省的存储空间
SELECT 
  SUM(file_size) as total_size,
  SUM(file_size) / COUNT(DISTINCT image_hash) as actual_size,
  SUM(file_size) - SUM(file_size) / COUNT(DISTINCT image_hash) as saved_size
FROM bookmark_images;
```

### 清理孤立图片

```typescript
// 在管理后台或定时任务中运行
const deletedCount = await cleanupOrphanedImages(db, bucket)
console.log(`Cleaned up ${deletedCount} orphaned images`)
```

## 注意事项

1. **哈希计算** - SHA-256 计算需要一定时间，但对用户体验影响很小
2. **R2 文件名** - 使用哈希作为文件名，无法从文件名看出原始来源
3. **删除策略** - 只有当没有任何书签使用时才删除 R2 文件
4. **向后兼容** - 保留 `cover_image` 字段，前端无需修改

## 成本对比

### 假设场景
- 1000 个用户
- 每人保存 100 个书签
- 平均 30% 的图片重复

**无去重：**
- 图片数：100,000
- 存储：100,000 × 200KB = 20GB
- 月成本：20GB × $0.015 = $0.30

**有去重：**
- 唯一图片：70,000
- 存储：70,000 × 200KB = 14GB
- 月成本：14GB × $0.015 = $0.21
- **节省：30%**

实际场景中，热门图片的重复率可能更高，节省效果更明显！
