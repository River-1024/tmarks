# 数据库迁移自动化 - 使用演示

## 🎬 演示场景

假设你是团队成员，刚刚从 GitHub 拉取了包含新迁移的代码。

## 📝 场景 1：Git Pull 自动提示

### 操作步骤

```bash
git pull
```

### 预期输出

```
remote: Enumerating objects: 5, done.
remote: Counting objects: 100% (5/5), done.
remote: Compressing objects: 100% (3/3), done.
remote: Total 3 (delta 2), reused 0 (delta 0), pack-reused 0
Unpacking objects: 100% (3/3), done.
From github.com:your-repo/tmarks
   abc1234..def5678  main       -> origin/main
Updating abc1234..def5678
Fast-forward
 migrations/0004_add_user_avatar.sql | 5 +++++
 1 file changed, 5 insertions(+)
 create mode 100644 migrations/0004_add_user_avatar.sql

🔍 检查是否有新的数据库迁移...

📦 检测到新的迁移文件，准备执行...

是否立即执行数据库迁移？
  1) 是 - 本地开发环境
  2) 是 - 生产环境
  3) 否 - 稍后手动执行

请选择 (1/2/3): 
```

### 选择 1（本地开发环境）

```
🚀 执行本地迁移...

🚀 开始数据库迁移检查...

环境: 本地开发

找到 2 个迁移文件:

  ✓ 0003_add_general_settings.sql
  ○ 0004_add_user_avatar.sql

📦 需要应用 1 个迁移:

  📝 执行迁移: 0004_add_user_avatar.sql
🌀 Executing on local database tmarks-prod-db (xxxx-xxxx-xxxx) from .wrangler/state/v3/d1:
🌀 To execute on your remote database, add a --remote flag to your wrangler command.
🚣 Executed 1 command in 0.123ms
  ✅ 成功: 0004_add_user_avatar.sql

==================================================
✅ 迁移完成！成功: 1

```

## 📝 场景 2：安装依赖时检查

### 操作步骤

```bash
pnpm install
```

### 预期输出（如果有待执行的迁移）

```
Lockfile is up to date, resolution step is skipped
Already up to date
Done in 1.2s

============================================================
⚠️  检测到待执行的数据库迁移
============================================================

发现 1 个新的迁移文件:

  • 0004_add_user_avatar.sql

请执行以下命令应用迁移:

  本地开发环境:
    pnpm db:auto-migrate:local

  生产环境:
    pnpm db:auto-migrate

============================================================
```

## 📝 场景 3：手动执行迁移

### 操作步骤

```bash
pnpm db:auto-migrate:local
```

### 预期输出

```
> tmarks@0.1.0 db:auto-migrate:local D:\path\to\tmarks
> node scripts/auto-migrate.js --local

🚀 开始数据库迁移检查...

环境: 本地开发

找到 2 个迁移文件:

  ✓ 0003_add_general_settings.sql
  ○ 0004_add_user_avatar.sql

📦 需要应用 1 个迁移:

  📝 执行迁移: 0004_add_user_avatar.sql
🌀 Executing on local database tmarks-prod-db (xxxx-xxxx-xxxx) from .wrangler/state/v3/d1:
🌀 To execute on your remote database, add a --remote flag to your wrangler command.
🚣 Executed 1 command in 0.123ms
  ✅ 成功: 0004_add_user_avatar.sql

==================================================

✅ 迁移完成！成功: 1

```

## 📝 场景 4：所有迁移已应用

### 操作步骤

```bash
pnpm db:auto-migrate:local
```

### 预期输出

```
> tmarks@0.1.0 db:auto-migrate:local D:\path\to\tmarks
> node scripts/auto-migrate.js --local

🚀 开始数据库迁移检查...

环境: 本地开发

找到 2 个迁移文件:

  ✓ 0003_add_general_settings.sql
  ✓ 0004_add_user_avatar.sql

✨ 所有迁移已应用，无需操作

```

## 📝 场景 5：创建新迁移

### 步骤 1：创建迁移文件

```bash
# 创建新的迁移文件
echo "ALTER TABLE users ADD COLUMN bio TEXT;" > migrations/0005_add_user_bio.sql
```

### 步骤 2：查看迁移状态

```bash
node scripts/check-migrations.js
```

### 预期输出

```
============================================================
⚠️  检测到待执行的数据库迁移
============================================================

发现 1 个新的迁移文件:

  • 0005_add_user_bio.sql

请执行以下命令应用迁移:

  本地开发环境:
    pnpm db:auto-migrate:local

  生产环境:
    pnpm db:auto-migrate

============================================================
```

### 步骤 3：执行迁移

```bash
pnpm db:auto-migrate:local
```

### 步骤 4：提交到 Git

```bash
git add migrations/0005_add_user_bio.sql
git commit -m "feat: add user bio field"
git push
```

## 📝 场景 6：强制重新执行所有迁移

### 使用场景

- 迁移历史文件丢失
- 需要重置本地数据库
- 测试迁移脚本

### 操作步骤

```bash
pnpm db:auto-migrate:local --force
```

### 预期输出

```
🚀 开始数据库迁移检查...

环境: 本地开发

找到 3 个迁移文件:

  ✓ 0003_add_general_settings.sql
  ✓ 0004_add_user_avatar.sql
  ✓ 0005_add_user_bio.sql

📦 需要应用 3 个迁移:

  📝 执行迁移: 0003_add_general_settings.sql
  ⏭️  跳过空文件: 0003_add_general_settings.sql
  
  📝 执行迁移: 0004_add_user_avatar.sql
  ✅ 成功: 0004_add_user_avatar.sql
  
  📝 执行迁移: 0005_add_user_bio.sql
  ✅ 成功: 0005_add_user_bio.sql

==================================================

✅ 迁移完成！成功: 3

```

## 📝 场景 7：迁移执行失败

### 假设迁移文件有错误

```sql
-- migrations/0006_bad_migration.sql
ALTER TABLE non_existent_table ADD COLUMN test TEXT;
```

### 执行迁移

```bash
pnpm db:auto-migrate:local
```

### 预期输出

```
🚀 开始数据库迁移检查...

环境: 本地开发

找到 4 个迁移文件:

  ✓ 0003_add_general_settings.sql
  ✓ 0004_add_user_avatar.sql
  ✓ 0005_add_user_bio.sql
  ○ 0006_bad_migration.sql

📦 需要应用 1 个迁移:

  📝 执行迁移: 0006_bad_migration.sql
🌀 Executing on local database tmarks-prod-db (xxxx-xxxx-xxxx) from .wrangler/state/v3/d1:
✘ [ERROR] Error in SQL statement: no such table: non_existent_table

  ❌ 失败: 0006_bad_migration.sql
     Command failed: wrangler d1 execute tmarks-prod-db --file="migrations/0006_bad_migration.sql" --local

==================================================

⚠️  迁移部分完成。成功: 0, 失败: 1
   请检查错误信息并手动修复

```

## 📝 场景 8：生产环境部署

### 操作步骤

```bash
# 1. 拉取最新代码
git pull

# 2. 安装依赖
pnpm install

# 3. 执行生产环境迁移
pnpm db:auto-migrate

# 4. 构建和部署
pnpm build:deploy
pnpm cf:deploy
```

### 迁移输出（生产环境）

```
🚀 开始数据库迁移检查...

环境: 生产环境

找到 3 个迁移文件:

  ✓ 0003_add_general_settings.sql
  ✓ 0004_add_user_avatar.sql
  ○ 0005_add_user_bio.sql

📦 需要应用 1 个迁移:

  📝 执行迁移: 0005_add_user_bio.sql
🌀 Executing on remote database tmarks-prod-db (xxxx-xxxx-xxxx):
🚣 Executed 1 command in 0.456ms
  ✅ 成功: 0005_add_user_bio.sql

==================================================

✅ 迁移完成！成功: 1

```

## 🎯 关键要点

### 1. 自动化流程

- ✅ Git pull 后自动提示
- ✅ 安装依赖后自动检查
- ✅ 一键执行迁移

### 2. 安全机制

- ✅ 记录迁移历史，避免重复执行
- ✅ 失败时停止，不继续执行后续迁移
- ✅ 清晰的错误信息

### 3. 用户友好

- ✅ 彩色输出，易于识别
- ✅ 交互式选择
- ✅ 详细的执行日志

### 4. 灵活性

- ✅ 支持本地和生产环境
- ✅ 支持强制重新执行
- ✅ 支持手动执行

## 📚 相关文档

- **详细指南**: `migrations/数据库迁移自动化指南.md`
- **快速设置**: `数据库迁移自动化-快速设置.md`
- **实现总结**: `数据库迁移自动化-实现总结.md`

## 🚀 立即开始

```bash
# 1. 给 Hook 添加执行权限（首次）
chmod +x .husky/post-merge

# 2. 测试自动检查
node scripts/check-migrations.js

# 3. 执行迁移
pnpm db:auto-migrate:local

# 4. 开始使用
git pull  # 会自动提示新迁移
```

---

**提示**: 这些演示场景展示了系统的各种使用情况，帮助你快速上手！
