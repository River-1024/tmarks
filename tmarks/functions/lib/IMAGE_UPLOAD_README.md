# 封面图上传到 R2 功能说明

## 功能概述

当用户通过 Tab 插件或 Web 界面创建书签时，如果提供了 `cover_image` URL，系统会自动将图片下载并上传到 Cloudflare R2 存储，然后使用 R2 的 URL 替换原始 URL。

## 优点

1. **永久可用** - 图片不会因为源站失效而丢失
2. **加载更快** - 通过 CDN 加速，全球访问速度快
3. **无防盗链** - 不受源站防盗链限制
4. **隐私保护** - 访问图片时不会暴露用户 IP 给源站

## 配置步骤

### 1. 创建 R2 Bucket

在 Cloudflare Dashboard 中创建一个 R2 Bucket（如果还没有）：

```bash
# 使用 wrangler CLI
wrangler r2 bucket create tmarks-snapshots
```

### 2. 配置公开访问域名

为 R2 Bucket 配置自定义域名或使用 R2.dev 域名：

1. 进入 Cloudflare Dashboard > R2 > 你的 Bucket
2. 点击 "Settings" > "Public Access"
3. 启用 "Allow Access" 并配置域名

例如：`https://r2.tmarks.app` 或 `https://pub-xxxxx.r2.dev`

### 3. 更新代码中的 R2 URL

修改 `tmarks/functions/lib/image-upload.ts` 中的 R2 URL：

```typescript
// 第 82 行
const r2Url = `https://r2.tmarks.app/${r2Key}` // 替换为你的 R2 公开域名
```

### 4. 绑定 R2 Bucket 到 Pages

在 `wrangler.toml` 中已经配置了绑定：

```toml
[[r2_buckets]]
binding = "SNAPSHOTS_BUCKET"
bucket_name = "tmarks-snapshots"
```

确保在 Cloudflare Pages 设置中也绑定了相同的 Bucket。

## 工作流程

```
1. 用户保存书签（提供 cover_image URL）
   ↓
2. 系统下载图片（10秒超时）
   ↓
3. 验证图片（类型、大小 < 10MB）
   ↓
4. 上传到 R2: bookmarks/{userId}/{bookmarkId}/cover.{ext}
   ↓
5. 保存 R2 URL 到数据库
   ↓
6. 如果失败，使用原始 URL（降级方案）
```

## 存储结构

```
bookmarks/
  └── {userId}/
      └── {bookmarkId}/
          └── cover.{ext}  # jpg, png, gif, webp, svg
```

## 限制

- 单个图片最大 10MB
- 下载超时 10 秒
- 只支持图片类型（image/*）
- 只处理 `cover_image`，不处理 `favicon`

## 成本估算

基于 Cloudflare R2 定价（2024）：

- 存储：$0.015/GB/月（前 10GB 免费）
- 读取：免费
- 写入：$4.50/百万次（前 100万次免费）

**示例：**
- 1000 个书签，每个图片 200KB
- 存储成本：200MB ≈ $0.003/月
- 非常便宜！

## 故障排查

### 图片上传失败

检查：
1. R2 Bucket 是否正确绑定
2. 原始图片 URL 是否可访问
3. 图片大小是否超过 10MB
4. 网络连接是否正常

### 图片无法显示

检查：
1. R2 公开访问是否已启用
2. R2 URL 是否正确配置
3. CORS 设置是否正确

## 未来优化

可以考虑的优化：

1. **图片压缩** - 使用 Cloudflare Images 或其他服务压缩图片
2. **多尺寸** - 生成缩略图（小、中、大）
3. **WebP 转换** - 自动转换为 WebP 格式
4. **异步上传** - 使用 Queue 异步处理（提高响应速度）
5. **重试机制** - 上传失败时自动重试
