# Cloudflare Pages 部署脚本 (PowerShell 版本)
# 自动检测迁移并提示执行

Write-Host ""
Write-Host "🚀 开始部署流程..." -ForegroundColor Blue
Write-Host ""

# 检查是否在 tmarks 目录
if (-not (Test-Path "package.json")) {
    Write-Host "❌ 请在 tmarks 目录下运行此脚本" -ForegroundColor Red
    exit 1
}

# 返回上级目录（项目根目录）
Set-Location ..

# 1. 检查是否有未提交的更改
$gitStatus = git status -s
if ($gitStatus) {
    Write-Host "⚠️  有未提交的更改，请先提交" -ForegroundColor Yellow
    Write-Host ""
    git status -s
    Write-Host ""
    exit 1
}

# 2. 检查是否有新的迁移
Write-Host "🔍 检查新的迁移文件..." -ForegroundColor Gray
$newMigrations = git diff origin/main HEAD --name-only | Select-String "^tmarks/migrations/[0-9]"

if ($newMigrations) {
    Write-Host "📦 检测到新的迁移文件:" -ForegroundColor Yellow
    Write-Host ""
    $newMigrations | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
    Write-Host ""
    
    # 3. 推送代码
    Write-Host "📤 推送代码到 GitHub..." -ForegroundColor Blue
    git push
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ 推送失败" -ForegroundColor Red
        exit 1
    }
    
    Write-Host ""
    Write-Host "✅ 代码已推送" -ForegroundColor Green
    Write-Host ""
    Write-Host "⏳ 等待 Cloudflare Pages 部署..." -ForegroundColor Yellow
    Write-Host "   请在 Cloudflare Dashboard 查看部署状态" -ForegroundColor Gray
    Write-Host "   通常需要 1-2 分钟" -ForegroundColor Gray
    Write-Host ""
    Write-Host "   Dashboard: https://dash.cloudflare.com/" -ForegroundColor Cyan
    Write-Host ""
    
    Read-Host "部署完成后按回车继续"
    
    # 4. 执行迁移
    Write-Host ""
    Write-Host "🔄 准备执行生产环境迁移..." -ForegroundColor Blue
    Write-Host ""
    
    $confirm = Read-Host "确认执行生产环境迁移？(y/N)"
    
    if ($confirm -eq 'y' -or $confirm -eq 'Y' -or $confirm -eq 'yes' -or $confirm -eq 'Yes') {
        Set-Location tmarks
        pnpm db:auto-migrate
        
        Write-Host ""
        Write-Host "✅ 部署完成！" -ForegroundColor Green
        Write-Host ""
        Write-Host "📝 下一步:" -ForegroundColor Blue
        Write-Host "   1. 访问生产环境验证功能" -ForegroundColor Gray
        Write-Host "   2. 检查数据库表结构" -ForegroundColor Gray
        Write-Host "   3. 通知团队成员" -ForegroundColor Gray
        Write-Host ""
    }
    else {
        Write-Host ""
        Write-Host "⏭️  已跳过迁移" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "⚠️  请记得稍后手动执行:" -ForegroundColor Yellow
        Write-Host "   cd tmarks; pnpm db:auto-migrate" -ForegroundColor Gray
        Write-Host ""
    }
}
else {
    Write-Host "✅ 无新的迁移文件" -ForegroundColor Green
    Write-Host ""
    
    # 3. 推送代码
    Write-Host "📤 推送代码到 GitHub..." -ForegroundColor Blue
    git push
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ 推送失败" -ForegroundColor Red
        exit 1
    }
    
    Write-Host ""
    Write-Host "✅ 部署完成！（无需迁移）" -ForegroundColor Green
    Write-Host ""
    Write-Host "⏳ Cloudflare Pages 将自动部署" -ForegroundColor Yellow
    Write-Host "   请在 Dashboard 查看部署状态" -ForegroundColor Gray
    Write-Host ""
}
