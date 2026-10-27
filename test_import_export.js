import { loadEnv, requireEnv } from './load-env.mjs';
import cloudbase from '@cloudbase/node-sdk';
import fs from 'fs';

loadEnv();

const cloudApp = cloudbase.init({
  env: process.env.COS_ENV,
  secretId: requireEnv('COS_SECRET_ID'),
  secretKey: requireEnv('COS_SECRET_KEY')
});
const db = cloudApp.database();

async function testStats() {
  console.log('\n=== 测试1: 统计接口 ===');
  try {
    const [fixedAssetRes, inventoryRes] = await Promise.all([
      db.collection('fixed_asset_records').count(),
      db.collection('inventory_records').count()
    ]);
    console.log('✅ 统计接口正常');
    console.log(`   固定资产记录: ${fixedAssetRes.total || 0}`);
    console.log(`   样机盘点记录: ${inventoryRes.total || 0}`);
    return true;
  } catch (err) {
    console.log('❌ 统计接口失败:', err.message);
    return false;
  }
}

async function testExport(collectionName, format) {
  console.log(`\n=== 测试2: 导出${collectionName}为${format}格式 ===`);
  try {
    const query = db.collection(collectionName);
    const result = await query.get();
    const data = result.data.map(row => row.data || row);
    
    if (data.length === 0) {
      console.log(`   ⚠️ ${collectionName}没有数据可导出`);
      return true;
    }
    
    console.log(`   ✅ 查询成功，共${data.length}条数据`);
    
    const isFixedAsset = collectionName === 'fixed_asset_records';
    const headers = isFixedAsset 
      ? ['资产名称', '资产代码', '战区', '盘点数量', '实盘数量', '保管人', '使用部门', '使用地点', '资产状态', '备注', '盘点人', '创建时间', '更新时间']
      : ['产品型号', '库存', '实盘数', '机身码', '仓库名称', '战区', '产品线', '大区', '备注', '盘点人', '创建时间', '更新时间'];
    
    const rows = data.map(row => {
      if (isFixedAsset) {
        return [
          row['资产名称'] || '',
          row['资产代码'] || '',
          row['战区'] || '',
          row['盘点数量'] || '',
          row['实盘数量'] || '',
          row['保管人'] || '',
          row['使用部门'] || '',
          row['使用地点'] || '',
          row['资产状态'] || '',
          row['备注'] || '',
          row['盘点人'] || '',
          row['createTime'] ? new Date(row['createTime']).toLocaleString() : '',
          row['updateTime'] ? new Date(row['updateTime']).toLocaleString() : ''
        ];
      } else {
        return [
          row['产品型号'] || '',
          row['库存'] || '',
          row['实盘数'] || '',
          row['机身码'] || '',
          row['仓库名称'] || '',
          row['战区'] || '',
          row['产品线'] || '',
          row['大区'] || '',
          row['备注'] || '',
          row['盘点人'] || '',
          row['createTime'] ? new Date(row['createTime']).toLocaleString() : '',
          row['updateTime'] ? new Date(row['updateTime']).toLocaleString() : ''
        ];
      }
    });
    
    if (format === 'csv') {
      let csv = headers.join(',') + '\n';
      rows.forEach(row => {
        csv += row.map(cell => {
          const val = String(cell);
          if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            return '"' + val.replace(/"/g, '""') + '"';
          }
          return val;
        }).join(',') + '\n';
      });
      fs.writeFileSync(`${collectionName}_test.csv`, csv, 'utf-8');
      console.log(`   ✅ CSV文件已生成: ${collectionName}_test.csv`);
    } else if (format === 'xlsx') {
      try {
        const XLSX = await import('xlsx');
        const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, '盘点数据');
        fs.writeFileSync(`${collectionName}_test.xlsx`, XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
        console.log(`   ✅ Excel文件已生成: ${collectionName}_test.xlsx`);
      } catch (err) {
        console.log(`   ⚠️ Excel导出失败(可能缺少依赖):`, err.message);
      }
    }
    
    return true;
  } catch (err) {
    console.log('❌ 导出失败:', err.message);
    return false;
  }
}

async function testImport() {
  console.log('\n=== 测试3: 导入测试 ===');
  try {
    const testData = {
      '资产名称': '测试资产_' + Date.now(),
      '资产代码': 'TEST' + Date.now(),
      '战区': '测试战区',
      '盘点数量': 1,
      '实盘数量': 0,
      '保管人': '测试保管人',
      '资产状态': '正常使用',
      'createTime': new Date(),
      'updateTime': new Date()
    };
    
    const result = await db.collection('fixed_asset_records').add({ data: testData });
    console.log('✅ 导入成功，记录ID:', result.id);
    
    const verifyResult = await db.collection('fixed_asset_records').doc(result.id).get();
    if (verifyResult.data && verifyResult.data['资产名称'] === testData['资产名称']) {
      console.log('✅ 数据验证成功');
      return true;
    } else {
      console.log('❌ 数据验证失败');
      return false;
    }
  } catch (err) {
    console.log('❌ 导入失败:', err.message);
    return false;
  }
}

async function main() {
  console.log('====================================');
  console.log('    资产盘点数据导入导出验证测试');
  console.log('====================================');
  
  let allPassed = true;
  
  allPassed = await testStats() && allPassed;
  
  await testExport('fixed_asset_records', 'csv');
  await testExport('inventory_records', 'csv');
  
  allPassed = await testImport() && allPassed;
  
  console.log('\n====================================');
  if (allPassed) {
    console.log('    ✅ 所有测试通过！');
  } else {
    console.log('    ❌ 部分测试失败');
  }
  console.log('====================================');
}

main().catch(err => {
  console.error('测试异常:', err);
});