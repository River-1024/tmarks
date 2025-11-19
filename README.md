# TMarks - 智能书签管理系统

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](VERSION.md)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Pages-orange.svg)](https://pages.cloudflare.com/)

> 一个现代化的书签管理系统，支持标签分类、标签页组管理、导入导出、公开分享等功能。

## ✨ 特性

### 核心功能

- 📚 **书签管理** - 创建、编辑、删除、搜索书签
- 🏷️ **标签系统** - 灵活的标签分类和筛选
- 📑 **标签页组** - 管理浏览器标签页组
- 🔍 **强大搜索** - 全文搜索，支持标题、URL、描述
- 📤 **导入导出** - 支持 JSON 格式导入导出
- 🔗 **公开分享** - 生成公开分享链接
- 🎨 **多视图模式** - 列表、卡片、极简、标题视图
- 🌓 **主题切换** - 支持亮色/暗色主题

### v2.0 新功能 🎉

- 🚀 **数据库迁移自动化** - 完整的迁移自动化系统
- 🔄 **本地开发自动化** - Git Pull 自动提示，安装后自动检查
- 📦 **一键部署** - 使用 `pnpm deploy` 一键部署
- ⚙️ **通用设置** - 搜索和标签自动清空配置
- 📝 **完整文档** - 10+ 篇详细文档和指南
- 🤖 **GitHub Actions** - 可选的完全自动化部署

## 🚀 快速开始

### 前置要求

- Node.js 18+
- pnpm 8+
- Cloudflare 账户
- Wrangler CLI

### 安装

```bash
# 克隆仓库
git clone https://github.com/your-username/tmarks.git
cd tmarks

# 安装依赖
pnpm install

# 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 填入你的配置

# 启动开发服务器
pnpm dev
```

### 数据库设置

```bash
# 创建 D1 数据库
wrangler d1 create tmarks-prod-db

# 执行初始化迁移
pnpm db:auto-migrate:local
```

### 部署

#### 方案 1：使用部署脚本（推荐）

```bash
pnpm deploy
```

#### 方案 2：手动部署

```bash
# 推送代码
git push

# 执行生产环境迁移
pnpm db:auto-migrate

# Cloudflare Pages 会自动部署
```

#### 方案 3：GitHub Actions 自动化

配置 GitHub Secrets 后，推送代码即可自动部署和迁移。

详见：[GitHub-Actions-自动迁移配置指南.md](GitHub-Actions-自动迁移配置指南.md)

## 📚 文档

### 快速开始

- [README-数据库迁移完整方案.md](README-数据库迁移完整方案.md) - 迁移方案总览
- [部署方案对比.md](部署方案对比.md) - 选择适合的部署方案
- [升级指南-v1.x-to-v2.0.md](升级指南-v1.x-to-v2.0.md) - 从 v1.x 升级

### 部署指南

- [Cloudflare-Pages-部署说明.md](Cloudflare-Pages-部署说明.md) - 部署脚本使用
- [GitHub-Actions-自动迁移配置指南.md](GitHub-Actions-自动迁移配置指南.md) - GitHub Actions 配置
- [tmarks/DEPLOY_CHECKLIST.md](tmarks/DEPLOY_CHECKLIST.md) - 部署检查清单

### 使用指南

- [tmarks/migrations/数据库迁移自动化指南.md](tmarks/migrations/数据库迁移自动化指南.md) - 详细使用指南
- [tmarks/MIGRATION_DEMO.md](tmarks/MIGRATION_DEMO.md) - 8个实际场景演示
- [tmarks/Cloudflare-Pages-数据库迁移方案.md](tmarks/Cloudflare-Pages-数据库迁移方案.md) - 迁移方案对比

### 技术文档

- [数据库迁移自动化-实现总结.md](数据库迁移自动化-实现总结.md) - 技术实现细节
- [CHANGELOG-v2.0.md](CHANGELOG-v2.0.md) - 版本更新日志
- [VERSION.md](VERSION.md) - 版本信息

## 🛠️ 技术栈

### 前端

- **框架**: React 18 + TypeScript
- **构建工具**: Vite
- **样式**: TailwindCSS
- **路由**: React Router v7
- **状态管理**: Zustand + React Query
- **UI 组件**: 自定义组件 + Lucide Icons

### 后端

- **平台**: Cloudflare Pages Functions
- **数据库**: Cloudflare D1 (SQLite)
- **存储**: Cloudflare KV
- **认证**: JWT

### 自动化

- **Git Hooks**: Husky
- **CI/CD**: GitHub Actions
- **迁移工具**: 自定义脚本 + Wrangler CLI
- **API**: Cloudflare D1 API

## 📦 项目结构

```
tmarks/
├── .github/
│   └── workflows/
│       └── deploy-and-migrate.yml    # GitHub Actions 工作流
├── .husky/
│   └── post-merge                    # Git Hook
├── functions/                        # Cloudflare Pages Functions
│   ├── api/                          # API 路由
│   ├── lib/                          # 工具函数
│   └── middleware/                   # 中间件
├── migrations/                       # 数据库迁移文件
│   ├── 0001_*.sql
│   ├── 0002_*.sql
│   └── 0003_add_general_settings.sql
├── scripts/                          # 自动化脚本
│   ├── auto-migrate.js               # 自动迁移脚本
│   ├── check-migrations.js           # 检查脚本
│   ├── deploy.ps1                    # PowerShell 部署脚本
│   └── deploy.sh                     # Bash 部署脚本
├── src/                              # 前端源码
│   ├── components/                   # React 组件
│   ├── hooks/                        # 自定义 Hooks
│   ├── pages/                        # 页面组件
│   ├── services/                     # API 服务
│   ├── stores/                       # Zustand 状态
│   └── lib/                          # 工具函数
└── public/                           # 静态资源
```

## 🎯 核心命令

### 开发

```bash
pnpm dev              # 启动开发服务器
pnpm build            # 构建生产版本
pnpm preview          # 预览生产构建
pnpm type-check       # TypeScript 类型检查
pnpm lint             # ESLint 检查
```

### 数据库

```bash
pnpm db:auto-migrate:local    # 本地迁移
pnpm db:auto-migrate          # 生产迁移
pnpm db:migrate:local         # Wrangler 本地迁移
pnpm db:migrate               # Wrangler 生产迁移
```

### 部署

```bash
pnpm deploy           # 一键部署（推荐）
pnpm build:deploy     # 构建部署版本
pnpm cf:deploy        # Cloudflare 部署
```

## 🔧 配置

### 环境变量

```bash
# .env.local
VITE_API_BASE_URL=http://localhost:8788
```

### Cloudflare 配置

在 Cloudflare Pages Dashboard 中配置：

**绑定：**
- D1 数据库：`DB` → `tmarks-prod-db`
- KV 命名空间：`RATE_LIMIT_KV`
- KV 命名空间：`PUBLIC_SHARE_KV`

**环境变量：**
- `JWT_SECRET`
- `ENCRYPTION_KEY`
- `ALLOW_REGISTRATION`

## 📊 版本信息

**当前版本**: v2.0.0 - Migration Automation

**发布日期**: 2024-11-19

**主要更新**:
- ✅ 完整的数据库迁移自动化
- ✅ 本地开发自动化
- ✅ 生产部署自动化
- ✅ 通用设置功能
- ✅ 完整的文档

详见：[CHANGELOG-v2.0.md](CHANGELOG-v2.0.md)

## 🤝 贡献

欢迎贡献！请遵循以下步骤：

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📝 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 🙏 致谢

- [Cloudflare Pages](https://pages.cloudflare.com/) - 托管平台
- [Cloudflare D1](https://developers.cloudflare.com/d1/) - 数据库
- [React](https://react.dev/) - UI 框架
- [Vite](https://vitejs.dev/) - 构建工具
- [TailwindCSS](https://tailwindcss.com/) - CSS 框架

## 📞 联系方式

- **问题反馈**: [GitHub Issues](https://github.com/your-username/tmarks/issues)
- **功能建议**: [GitHub Discussions](https://github.com/your-username/tmarks/discussions)
- **文档**: 查看 `docs/` 目录

## 🌟 Star History

如果这个项目对你有帮助，请给它一个 ⭐️！

---

**Made with ❤️ by TMarks Team**

**Version**: v2.0.0 | **License**: MIT | **Platform**: Cloudflare Pages
