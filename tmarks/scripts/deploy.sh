#!/bin/bash

# Cloudflare Pages 部署脚本
# 自动检测迁移并提示执行

echo ""
echo "🚀 开始部署流程..."
echo ""

# 检查是否在 tmarks 目录
if [ ! -f "package.json" ]; then
  echo "❌ 请在 tmarks 目录下运行此脚本"
  exit 1
fi

# 返回上级目录（项目根目录）
cd ..

# 1. 检查是否有未提交的更改
if [[ -n $(git status -s) ]]; then
  echo "⚠️  有未提交的更改，请先提交"
  echo ""
  git status -s
  echo ""
  exit 1
fi

# 2. 检查是否有新的迁移
echo "🔍 检查新的迁移文件..."
NEW_MIGRATIONS=$(git diff origin/main HEAD --name-only | grep "^tmarks/migrations/[0-9]" || echo "")

if [ -n "$NEW_MIGRATIONS" ]; then
  echo "📦 检测到新的迁移文件:"
  echo ""
  echo "$NEW_MIGRATIONS" | sed 's/^/   /'
  echo ""
  
  # 3. 推送代码
  echo "📤 推送代码到 GitHub..."
  git push
  
  if [ $? -ne 0 ]; then
    echo "❌ 推送失败"
    exit 1
  fi
  
  echo ""
  echo "✅ 代码已推送"
  echo ""
  echo "⏳ 等待 Cloudflare Pages 部署..."
  echo "   请在 Cloudflare Dashboard 查看部署状态"
  echo "   通常需要 1-2 分钟"
  echo ""
  echo "   Dashboard: https://dash.cloudflare.com/"
  echo ""
  
  read -p "部署完成后按回车继续..."
  
  # 4. 执行迁移
  echo ""
  echo "🔄 准备执行生产环境迁移..."
  echo ""
  
  read -p "确认执行生产环境迁移？(y/N): " confirm
  
  if [[ $confirm == [yY] || $confirm == [yY][eE][sS] ]]; then
    cd tmarks
    pnpm db:auto-migrate
    
    echo ""
    echo "✅ 部署完成！"
    echo ""
    echo "📝 下一步："
    echo "   1. 访问生产环境验证功能"
    echo "   2. 检查数据库表结构"
    echo "   3. 通知团队成员"
    echo ""
  else
    echo ""
    echo "⏭️  已跳过迁移"
    echo ""
    echo "⚠️  请记得稍后手动执行："
    echo "   cd tmarks && pnpm db:auto-migrate"
    echo ""
  fi
  
else
  echo "✅ 无新的迁移文件"
  echo ""
  
  # 3. 推送代码
  echo "📤 推送代码到 GitHub..."
  git push
  
  if [ $? -ne 0 ]; then
    echo "❌ 推送失败"
    exit 1
  fi
  
  echo ""
  echo "✅ 部署完成！（无需迁移）"
  echo ""
  echo "⏳ Cloudflare Pages 将自动部署"
  echo "   请在 Dashboard 查看部署状态"
  echo ""
fi
