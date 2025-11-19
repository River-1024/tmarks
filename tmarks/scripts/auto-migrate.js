#!/usr/bin/env node

/**
 * 自动数据库迁移脚本
 * 
 * 功能：
 * 1. 检测新的迁移文件
 * 2. 自动执行未应用的迁移
 * 3. 记录迁移历史
 * 
 * 使用方式：
 * - 本地开发: pnpm db:auto-migrate:local
 * - 生产环境: pnpm db:auto-migrate
 */

import { execSync } from 'child_process'
import { readFileSync, existsSync, writeFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const MIGRATIONS_DIR = join(__dirname, '../migrations')
const MIGRATION_HISTORY_FILE = join(__dirname, '../.migration-history.json')

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

// 读取迁移历史
function getMigrationHistory() {
  if (!existsSync(MIGRATION_HISTORY_FILE)) {
    return { migrations: [] }
  }
  try {
    return JSON.parse(readFileSync(MIGRATION_HISTORY_FILE, 'utf-8'))
  } catch (error) {
    log(`⚠️  无法读取迁移历史: ${error.message}`, 'yellow')
    return { migrations: [] }
  }
}

// 保存迁移历史
function saveMigrationHistory(history) {
  writeFileSync(MIGRATION_HISTORY_FILE, JSON.stringify(history, null, 2))
}

// 获取所有迁移文件（按编号排序）
function getMigrationFiles() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(file => {
      // 只处理编号开头的 SQL 文件
      return /^\d{4}_.*\.sql$/.test(file)
    })
    .sort()
  
  return files
}

// 执行迁移
function executeMigration(filename, isLocal = false) {
  const filepath = join(MIGRATIONS_DIR, filename)
  const sql = readFileSync(filepath, 'utf-8')
  
  // 跳过空文件或只有注释的文件
  const hasContent = sql.split('\n').some(line => {
    const trimmed = line.trim()
    return trimmed && !trimmed.startsWith('--')
  })
  
  if (!hasContent) {
    log(`  ⏭️  跳过空文件: ${filename}`, 'gray')
    return true
  }
  
  try {
    const dbName = 'tmarks-prod-db'
    const localFlag = isLocal ? '--local' : ''
    
    log(`  📝 执行迁移: ${filename}`, 'blue')
    
    // 使用 wrangler d1 execute 执行 SQL
    const command = `wrangler d1 execute ${dbName} --file="${filepath}" ${localFlag}`.trim()
    
    execSync(command, {
      stdio: 'inherit',
      cwd: join(__dirname, '..')
    })
    
    log(`  ✅ 成功: ${filename}`, 'green')
    return true
  } catch (error) {
    log(`  ❌ 失败: ${filename}`, 'red')
    log(`     ${error.message}`, 'red')
    return false
  }
}

// 主函数
function main() {
  const isLocal = process.argv.includes('--local')
  const force = process.argv.includes('--force')
  
  log('\n🚀 开始数据库迁移检查...\n', 'blue')
  log(`环境: ${isLocal ? '本地开发' : '生产环境'}`, 'gray')
  
  // 读取迁移历史
  const history = getMigrationHistory()
  const appliedMigrations = new Set(history.migrations || [])
  
  // 获取所有迁移文件
  const migrationFiles = getMigrationFiles()
  
  if (migrationFiles.length === 0) {
    log('\n⚠️  未找到迁移文件（格式: 0001_xxx.sql）', 'yellow')
    log('   迁移文件应该以 4 位数字开头，例如: 0003_add_general_settings.sql\n', 'gray')
    return
  }
  
  log(`\n找到 ${migrationFiles.length} 个迁移文件:\n`, 'gray')
  
  // 找出未应用的迁移
  const pendingMigrations = migrationFiles.filter(file => {
    const isApplied = appliedMigrations.has(file)
    const status = isApplied ? '✓' : '○'
    const color = isApplied ? 'green' : 'yellow'
    log(`  ${status} ${file}`, color)
    return !isApplied || force
  })
  
  if (pendingMigrations.length === 0) {
    log('\n✨ 所有迁移已应用，无需操作\n', 'green')
    return
  }
  
  log(`\n📦 需要应用 ${pendingMigrations.length} 个迁移:\n`, 'yellow')
  
  // 执行迁移
  let successCount = 0
  let failCount = 0
  
  for (const file of pendingMigrations) {
    const success = executeMigration(file, isLocal)
    if (success) {
      successCount++
      // 记录到历史
      if (!appliedMigrations.has(file)) {
        history.migrations = history.migrations || []
        history.migrations.push(file)
        history.migrations.sort()
      }
    } else {
      failCount++
      // 失败则停止
      break
    }
  }
  
  // 保存迁移历史
  if (successCount > 0) {
    history.lastUpdated = new Date().toISOString()
    saveMigrationHistory(history)
  }
  
  // 输出结果
  log('\n' + '='.repeat(50), 'gray')
  if (failCount === 0) {
    log(`\n✅ 迁移完成！成功: ${successCount}`, 'green')
  } else {
    log(`\n⚠️  迁移部分完成。成功: ${successCount}, 失败: ${failCount}`, 'yellow')
    log('   请检查错误信息并手动修复', 'yellow')
  }
  log('')
}

// 运行
try {
  main()
} catch (error) {
  log(`\n❌ 迁移失败: ${error.message}\n`, 'red')
  process.exit(1)
}
