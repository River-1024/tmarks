#!/usr/bin/env node

/**
 * 检查数据库结构是否完整
 * 用法: node scripts/check-db-schema.js [--local]
 */

import { execSync } from 'child_process';

const isLocal = process.argv.includes('--local');
const localFlag = isLocal ? '--local' : '';

console.log(`🔍 检查数据库结构 (${isLocal ? '本地' : '生产'}环境)...\n`);

// 必需的表
const requiredTables = [
  'users',
  'bookmarks',
  'tags',
  'bookmark_tags',
  'user_preferences',
  'bookmark_snapshots',
  'bookmark_images',
  'api_keys',
];

// bookmarks表必需的字段
const requiredBookmarkFields = [
  'id',
  'user_id',
  'title',
  'url',
  'description',
  'cover_image',
  'cover_image_id',
  'favicon',
  'has_snapshot',
  'latest_snapshot_at',
  'snapshot_count',
  'is_pinned',
  'is_archived',
  'is_public',
  'click_count',
  'last_clicked_at',
  'created_at',
  'updated_at',
  'deleted_at',
];

// user_preferences表必需的字段
const requiredPreferenceFields = [
  'user_id',
  'theme',
  'page_size',
  'view_mode',
  'density',
  'tag_layout',
  'sort_by',
  'search_auto_clear_seconds',
  'tag_selection_auto_clear_seconds',
  'enable_search_auto_clear',
  'enable_tag_selection_auto_clear',
  'default_bookmark_icon',
  'snapshot_retention_count',
  'snapshot_auto_create',
  'snapshot_auto_dedupe',
  'snapshot_auto_cleanup_days',
  'updated_at',
];

function executeQuery(query) {
  try {
    const command = `pnpm wrangler d1 execute tmarks-prod-db ${localFlag} --command="${query}"`;
    const result = execSync(command, { encoding: 'utf-8' });
    return result;
  } catch (error) {
    return null;
  }
}

function checkTable(tableName) {
  console.log(`📋 检查表: ${tableName}`);
  const result = executeQuery(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`);
  
  if (result && result.includes(tableName)) {
    console.log(`   ✅ 表存在\n`);
    return true;
  } else {
    console.log(`   ❌ 表不存在\n`);
    return false;
  }
}

function checkTableFields(tableName, requiredFields) {
  console.log(`🔍 检查表字段: ${tableName}`);
  const result = executeQuery(`PRAGMA table_info(${tableName})`);
  
  if (!result) {
    console.log(`   ❌ 无法获取表结构\n`);
    return false;
  }

  const missingFields = [];
  
  for (const field of requiredFields) {
    if (result.includes(field)) {
      console.log(`   ✅ ${field}`);
    } else {
      console.log(`   ❌ ${field} (缺失)`);
      missingFields.push(field);
    }
  }
  
  console.log();
  
  if (missingFields.length > 0) {
    console.log(`⚠️  缺失字段: ${missingFields.join(', ')}\n`);
    return false;
  }
  
  return true;
}

function checkMigrations() {
  console.log(`📜 检查迁移记录`);
  const result = executeQuery(`SELECT version FROM schema_migrations ORDER BY version`);
  
  if (result) {
    console.log(result);
  } else {
    console.log(`   ❌ 无法获取迁移记录\n`);
  }
}

// 主检查流程
let allGood = true;

console.log('='.repeat(60));
console.log('检查必需的表');
console.log('='.repeat(60) + '\n');

for (const table of requiredTables) {
  if (!checkTable(table)) {
    allGood = false;
  }
}

console.log('='.repeat(60));
console.log('检查bookmarks表字段');
console.log('='.repeat(60) + '\n');

if (!checkTableFields('bookmarks', requiredBookmarkFields)) {
  allGood = false;
}

console.log('='.repeat(60));
console.log('检查user_preferences表字段');
console.log('='.repeat(60) + '\n');

if (!checkTableFields('user_preferences', requiredPreferenceFields)) {
  allGood = false;
}

console.log('='.repeat(60));
checkMigrations();
console.log('='.repeat(60) + '\n');

if (allGood) {
  console.log('✅ 数据库结构完整！\n');
  process.exit(0);
} else {
  console.log('❌ 数据库结构不完整，请查看上面的错误信息\n');
  console.log('💡 修复建议：');
  console.log('   1. 查看 SQL_ANALYSIS.md 了解详细信息');
  console.log('   2. 手动执行缺失的ALTER TABLE语句');
  console.log('   3. 或者重新执行数据库迁移\n');
  process.exit(1);
}
