import cloudbase from '@cloudbase/node-sdk';
import fs from 'fs';
import path from 'path';
// ???? .env ?????????
import { readFileSync, existsSync } from 'fs';
function __loadEnv() {
  const p = new URL('./.env', import.meta.url).pathname;
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf-8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (k && !(k in process.env)) process.env[k] = v;
  }
}
__loadEnv();


const app = cloudbase.init({
  env: process.env.COS_ENV || 'cloud1-db-d5g1771j0b91888c7',
  secretId: process.env.COS_SECRET_ID || '',
  secretKey: process.env.COS_SECRET_KEY || ''
});
const db = app.database();
const desktop = 'C:/Users/FJ/Desktop';

function toCsv(headers, rows) {
  let csv = '\uFEFF';
  csv += headers.map(h => h.includes(',') ? '"' + h + '"' : h).join(',') + '\n';
  rows.forEach(row => {
    csv += row.map(v => {
      const s = String(v !== undefined && v !== null ? v : '');
      return s.includes(',') || s.includes('\n') || s.includes('"') ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',') + '\n';
  });
  return csv;
}

console.log('=== 导出数据到桌面 ===\n');

// 固定资产
const fixedResult = await db.collection('fixed_asset_records').get();
const fixedData = fixedResult.data.map(r => r.data || r);
const fixedHeaders = ['序号', '公司代码+资产代码', '公司代码', '资产', '资产分类描述', '资产名称', '型号', '数量', '资本化日期', '不活动日期', '资产主号文本', '库存注记', '房间', '资产类型名', '固定资产报销单号', '购置资产日期', '购置价值', '累计折旧', '净值', '减值准备', '账面价值', '原值', '功能范围', 'WBS描述', '战区/部门', '部门负责人', '盘点人', '盘点数量', '实盘数量', '信息变更', '资产状态', '使用部门', '使用人', '使用地点'];
const fixedRows = fixedData.map((row, i) => [
  i + 1, row['资产代码'] || '', row['公司代码'] || '', row['资产分类'] || '', row['资产分类'] || '',
  row['资产名称'] || '', row['型号'] || '', row['数量'] || '',
  '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
  row['战区'] || '', row['部门负责人'] || '', row['盘点人'] || '',
  row['盘点数量'] || '', row['实盘数量'] || '', '',
  row['资产状态'] || '', row['使用部门'] || '', row['使用人'] || '', row['使用地点'] || ''
]);
fs.writeFileSync(path.join(desktop, '固定资产盘点导出.csv'), toCsv(fixedHeaders, fixedRows), 'utf-8');
console.log('✅ 固定资产盘点导出.csv: ' + fixedData.length + ' 条');
fixedData.forEach(r => console.log('   ', r['资产名称'], '|', r['战区'], '|', r['盘点数量']));

// 样机盘点
const invResult = await db.collection('inventory_records').get();
const invData = invResult.data.map(r => r.data || r);
const invHeaders = ['大区', '战区', '仓库名称（分品类）', '品类', '产品型号', '库存', '实盘数', '机身码', '备注', '盘点人'];
const invRows = invData.map(row => [
  row['大区'] || '', row['战区'] || '', row['仓库名称'] || '',
  row['品类'] || '', row['产品型号'] || '',
  row['库存'] || '', row['实盘数'] || '', row['机身码'] || '',
  row['备注'] || '', row['盘点人'] || ''
]);
fs.writeFileSync(path.join(desktop, '样机盘点导出.csv'), toCsv(invHeaders, invRows), 'utf-8');
console.log('✅ 样机盘点导出.csv: ' + invData.length + ' 条');
invData.forEach(r => console.log('   ', r['仓库名称'], '|', r['品类'], '|', r['产品型号']));

console.log('\n✅ 导出完成！格式与导入时一致。');