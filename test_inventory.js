import cloudbase from '@cloudbase/node-sdk';
import fs from 'fs';

const app = cloudbase.init({
  env: 'cloud1-db-d5g1771j0b91888c7',
  secretId: '***REDACTED***',
  secretKey: '***REDACTED***'
});
const db = app.database();

const testRecords = [
  { '产品型号': 'TCL-65C728', '战区': '深圳战区', '库存': 10, '实盘数': 10, '机身码': 'SN001', '仓库名称': '深圳仓库A', '产品线': 'TV', '大区': '华南', '备注': '', '盘点人': '', 'createTime': new Date(), 'updateTime': new Date() },
  { '产品型号': 'TCL-55C635', '战区': '深圳战区', '库存': 5, '实盘数': 4, '机身码': 'SN002', '仓库名称': '深圳仓库B', '产品线': 'TV', '大区': '华南', '备注': '', '盘点人': '', 'createTime': new Date(), 'updateTime': new Date() },
  { '产品型号': 'TCL-AC12000', '战区': '广州战区', '库存': 20, '实盘数': 20, '机身码': 'SN003', '仓库名称': '广州仓库A', '产品线': '空调', '大区': '华南', '备注': '', '盘点人': '', 'createTime': new Date(), 'updateTime': new Date() },
];

async function main() {
  console.log('====================================');
  console.log('       样机盘点导入导出验证测试');
  console.log('====================================');

  // 1. 导入
  console.log('\n=== 1. 样机盘点数据导入 ===');
  let importSuccess = 0, importFail = 0;
  for (const r of testRecords) {
    try {
      const result = await db.collection('inventory_records').add({ data: r });
      console.log('   ✅ 导入成功:', r['产品型号'], 'ID:', result.id);
      importSuccess++;
    } catch (e) {
      console.log('   ❌ 导入失败:', r['产品型号'], e.message);
      importFail++;
    }
  }
  console.log(`   导入结果: 成功 ${importSuccess} / 失败 ${importFail}`);

  // 2. 统计
  console.log('\n=== 2. 统计查询 ===');
  try {
    const [fixedRes, invRes] = await Promise.all([
      db.collection('fixed_asset_records').count(),
      db.collection('inventory_records').count()
    ]);
    console.log('   ✅ 固定资产:', fixedRes.total, '条');
    console.log('   ✅ 样机盘点:', invRes.total, '条');
  } catch (e) {
    console.log('   ❌ 统计失败:', e.message);
  }

  // 3. 导出CSV
  console.log('\n=== 3. 样机盘点导出CSV ===');
  try {
    const result = await db.collection('inventory_records').get();
    const data = result.data.map(row => row.data || row);
    console.log('   ✅ 查询成功，共', data.length, '条');

    const headers = ['产品型号', '库存', '实盘数', '机身码', '仓库名称', '战区', '产品线', '大区', '备注', '盘点人', '创建时间', '更新时间'];
    let csv = headers.join(',') + '\n';
    data.forEach(row => {
      csv += headers.map(h => {
        const val = row[h] !== undefined && row[h] !== null ? String(row[h]) : '';
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return '"' + val.replace(/"/g, '""') + '"';
        }
        return val;
      }).join(',') + '\n';
    });

    fs.writeFileSync('inventory_records_test.csv', csv, 'utf-8');
    console.log('   ✅ CSV文件已生成: inventory_records_test.csv');

    // 预览
    console.log('\n   导出内容预览:');
    console.log('   ' + headers.join(' | '));
    console.log('   ' + '-'.repeat(80));
    data.forEach(r => {
      const row = headers.map(h => r[h] !== undefined ? String(r[h]).substring(0, 15) : '');
      console.log('   ' + row.join(' | '));
    });
  } catch (e) {
    console.log('   ❌ 导出失败:', e.message);
  }

  // 4. 按战区筛选导出
  console.log('\n=== 4. 按战区筛选导出(深圳战区) ===');
  try {
    const query = db.collection('inventory_records');
    query.where({ '战区': '深圳战区' });
    const result = await query.get();
    const data = result.data.map(row => row.data || row);
    console.log('   ✅ 深圳战区样机:', data.length, '条');
    data.forEach(r => console.log('     ', r['产品型号'], '|', r['仓库名称']));
  } catch (e) {
    console.log('   ❌ 筛选导出失败:', e.message);
  }

  console.log('\n====================================');
  console.log('           ✅ 测试完成！');
  console.log('====================================');
}

main().catch(err => console.error('异常:', err));