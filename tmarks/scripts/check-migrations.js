#!/usr/bin/env node

/**
 * 检查是否有待执行的迁移
 * 在 pnpm install 后自动运行
 */

import { readFileSync, existsSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const MIGRATIONS_DIR = join(__dirname, '../migrations')
const MIGRATION_HISTORY_FILE = join(__dirname, '../.migration-history.json')

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  yellow: '\x1b[33m',
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
    return { migrations: [] }
  }
}

// 获取所有迁移文件
function getMigrationFiles() {
  if (!existsSync(MIGRATIONS_DIR)) {
    return []
  }
  
  return readdirSync(MIGRATIONS_DIR)
    .filter(file => /^\d{4}_.*\.sql$/.test(file))
    .sort()
}

// 主函数
function main() {
  const history = getMigrationHistory()
  const appliedMigrations = new Set(history.migrations || [])
  const migrationFiles = getMigrationFiles()
  
  if (migrationFiles.length === 0) {
    return
  }
  
  const pendingMigrations = migrationFiles.filter(file => !appliedMigrations.has(file))
  
  if (pendingMigrations.length > 0) {
    log('\n' + '='.repeat(60), 'yellow')
    log('⚠️  检测到待执行的数据库迁移', 'yellow')
    log('='.repeat(60), 'yellow')
    log('', 'reset')
    log(`发现 ${pendingMigrations.length} 个新的迁移文件:`, 'blue')
    log('', 'reset')
    
    pendingMigrations.forEach(file => {
      log(`  • ${file}`, 'gray')
    })
    
    log('', 'reset')
    log('请执行以下命令应用迁移:', 'blue')
    log('', 'reset')
    log('  本地开发环境:', 'gray')
    log('    pnpm db:auto-migrate:local', 'yellow')
    log('', 'reset')
    log('  生产环境:', 'gray')
    log('    pnpm db:auto-migrate', 'yellow')
    log('', 'reset')
    log('='.repeat(60), 'yellow')
    log('', 'reset')
  }
}

// 运行
try {
  main()
} catch (error) {
  // 静默失败，不影响 install
}
