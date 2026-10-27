/**
 * 导出验证脚本（一次性）：
 * 1) 管理后台导出：调用 /api/casual/export 与 /api/inventory/export（带会话令牌），下载到桌面
 * 2) 小程序侧导出：直连云数据库（access_token + tcb databasequery），按小程序导出逻辑与命名规范生成文件到桌面
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktop = 'C:/Users/FJ/Desktop';

// 加载 .env（自写 loader，进程环境变量优先）
function loadEnv(file) {
  const env = {};
  try {
    const content = fs.readFileSync(file, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !m[1].startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch (_) { /* 忽略缺失 */ }
  return env;
}
const env = { ...loadEnv(path.join(__dirname, '.env')), ...process.env };
const BASE = `http://localhost:${env.PORT || 3005}`;

function formatTs() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// ==================== 1. 管理后台导出 ====================
async function adminExport(api, label, format = 'xlsx') {
  try {
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: env.ADMIN_PASSWORD })
    });
    const loginData = await loginRes.json();
    if (!loginData.token) {
      console.error(`[管理后台] ${label} 登录失败:`, JSON.stringify(loginData));
      return;
    }
    const res = await fetch(`${BASE}/api/${api}/export?format=${format}`, {
      headers: { 'x-auth-token': loginData.token }
    });
    if (!res.ok) {
      console.error(`[管理后台] ${label} HTTP ${res.status}:`, (await res.text()).slice(0, 200));
      return;
    }
    const cd = res.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename\*=UTF-8''([^;]+)/);
    const fileName = m ? decodeURIComponent(m[1]) : `${api}_export.${format}`;
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(path.join(desktop, fileName), buf);
    console.log(`[管理后台] ✅ ${label}: ${fileName} (${(buf.length / 1024).toFixed(1)}KB)`);
  } catch (err) {
    console.error(`[管理后台] ${label} 失败:`, err.message);
  }
}

// ==================== 2. 小程序侧导出（模拟小程序逻辑） ====================
async function getAccessToken() {
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${env.WX_APPID}&secret=${env.WX_SECRET}`;
  const r = await (await fetch(url)).json();
  if (!r.access_token) throw new Error('获取 access_token 失败: ' + JSON.stringify(r));
  return r.access_token;
}

async function tcbQueryAll(collection) {
  const token = await getAccessToken();
  const all = [];
  const MAX = 1000;
  for (let skip = 0; skip < 50000; skip += MAX) {
    const query = `db.collection('${collection}').where({}).skip(${skip}).limit(${MAX}).get()`;
    const res = await fetch(`https://api.weixin.qq.com/tcb/databasequery?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ env: env.TCB_ENV, query })
    });
    const data = await res.json();
    if (data.errcode) throw new Error(JSON.stringify(data));
    const list = (data.data || []).map(d => (typeof d === 'string' ? JSON.parse(d) : d));
    all.push(...list);
    if (list.length < MAX) break;
  }
  return all;
}

// 与小程序 cloud.js getAllCasualRecordsForExport / getAllInventoryRecordsForExport 对齐的过滤与映射
const NON_INVENTORY_TYPES = ['confirmation', 'signature', 'checkin'];
function isInventoryRecord(r) {
  return !r.recordType || !NON_INVENTORY_TYPES.includes(r.recordType);
}
function mapRecord(r) {
  return {
    大区: r['大区'] || '',
    战区: r['战区'] || '',
    '仓库名称（分品类）': r['仓库名称'] || '',
    产品线: r['品类'] || r['产品线'] || '',
    产品型号: r['产品型号'] || '',
    库存: parseInt(r['库存']) || 0,
    实盘数: parseInt(r['实盘数']) || 0,
    机身码: r['机身码'] || '',
    备注: r['备注'] || '',
    盘点人: r['盘点人'] || '',
    来源: r['来源'] || ''
  };
}
const HEADERS = ['序号', '大区', '战区', '仓库名称（分品类）', '产品线', '产品型号', '库存', '实盘数', '机身码', '备注', '盘点人', '来源'];

function writeXlsx(rows, fileName) {
  const aoa = [HEADERS, ...rows.map((r, i) => [i + 1, ...HEADERS.slice(1).map(h => r[h] ?? '')])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '盘点门店');
  XLSX.writeFile(wb, path.join(desktop, fileName));
  console.log(`[小程序] ✅ ${fileName} (${rows.length} 条)`);
}

async function miniAppExport(collection, label) {
  const all = await tcbQueryAll(collection);
  const records = all.filter(isInventoryRecord).map(mapRecord);
  if (records.length === 0) {
    console.log(`[小程序] ${label} 无有效盘点记录（原始 ${all.length} 条）`);
    return;
  }
  const ts = formatTs();
  // 汇总导出：盘点明细汇总_{盘点人}_{时间戳}
  const userName = '付建';
  writeXlsx(records, `盘点明细汇总_${userName}_${ts}.xlsx`);

  // 按门店拆分：WP-{战区}{门店}_{盘点人}盘点明细_{时间戳}
  const storeMap = new Map();
  records.forEach(r => {
    const name = (r['仓库名称（分品类）'] || '').trim();
    if (!name) return;
    if (!storeMap.has(name)) storeMap.set(name, []);
    storeMap.get(name).push(r);
  });
  for (const [name, rows] of storeMap.entries()) {
    const zone = rows[0]['战区'] || '';
    const base = /^WP-/.test(name) ? name : `WP-${zone}${name}`;
    writeXlsx(rows, `${base}_${userName}盘点明细_${ts}.xlsx`);
  }
}

// 调用云函数（微信 HTTP API：env/name 必须放 URL 查询参数，POST body 只放函数入参）
// 参考：https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/reference-http-api/functions/invokeCloudFunction.html
async function invokeCloudFn(name, data) {
  const token = await getAccessToken();
  const url = `https://api.weixin.qq.com/tcb/invokecloudfunction?access_token=${token}&env=${env.TCB_ENV}&name=${encodeURIComponent(name)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (json.errcode) throw new Error(`invokecloudfunction ${name}: ` + JSON.stringify(json));
  return JSON.parse(json.resp_data || '{}');
}

// 下载云存储文件（tcb/batchdownloadfile：file_list 数组，返回 download_url 后再拉取二进制）
async function downloadCloudFile(fileID) {
  const token = await getAccessToken();
  const res = await fetch(`https://api.weixin.qq.com/tcb/batchdownloadfile?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ env: env.TCB_ENV, file_list: [{ fileid: fileID, max_age: 7200 }] })
  });
  const json = await res.json();
  if (json.errcode) throw new Error('batchdownloadfile: ' + JSON.stringify(json));
  const item = (json.file_list || [])[0];
  if (!item || item.status !== 0) throw new Error('batchdownloadfile: ' + JSON.stringify(item));
  return Buffer.from(await (await fetch(item.download_url)).arrayBuffer());
}

// 小程序侧盘点报告（PDF）：逐门店调用 generateReport 云函数（与小程序报告页同一云函数），
// 下载后按 {门店}_{盘点人}盘点报告_{时间戳}.pdf 命名保存到桌面
async function miniAppReports(collection, moduleType, label) {
  const all = await tcbQueryAll(collection);
  const records = all.filter(isInventoryRecord).map(mapRecord);
  if (records.length === 0) {
    console.log(`[小程序报告] ${label} 无有效盘点记录`);
    return;
  }
  const ts = formatTs();
  const userName = '付建';
  const storeMap = new Map();
  records.forEach(r => {
    const name = (r['仓库名称（分品类）'] || '').trim();
    if (!name) return;
    if (!storeMap.has(name)) storeMap.set(name, []);
    storeMap.get(name).push(r);
  });
  for (const [name, rows] of storeMap.entries()) {
    try {
      const res = await invokeCloudFn('generateReport', {
        storeName: name,
        zone: rows[0]['战区'] || '',
        region: rows[0]['大区'] || '',
        userName,
        moduleType
      });
      if (res.success && res.fileID) {
        const buf = await downloadCloudFile(res.fileID);
        const base = /^WP-/.test(name) ? name : `WP-${rows[0]['战区'] || ''}${name}`;
        const fileName = `${base}_${userName}盘点报告_${ts}.pdf`;
        fs.writeFileSync(path.join(desktop, fileName), buf);
        console.log(`[小程序报告] ✅ ${fileName} (${(buf.length / 1024).toFixed(1)}KB)`);
      } else {
        console.error(`[小程序报告] ${name} 生成失败:`, res.msg || JSON.stringify(res));
      }
    } catch (err) {
      console.error(`[小程序报告] ${name} 调用失败:`, err.message);
    }
  }
}

console.log('=== 导出验证开始 ===\n');

// 1. 管理后台
await adminExport('casual', '随手盘', 'xlsx');
await adminExport('inventory', '正常盘', 'xlsx');
await adminExport('casual', '随手盘报告', 'pdf');
await adminExport('inventory', '正常盘报告', 'pdf');

// 2. 小程序侧
console.log('\n--- 小程序侧导出（直连云数据库，管理员=付建） ---');
try {
  await miniAppExport('casual_records', '随手盘');
} catch (err) {
  console.error('[小程序] casual_records 导出失败:', err.message);
}
try {
  await miniAppExport('inventory_records', '正常盘');
} catch (err) {
  console.error('[小程序] inventory_records 导出失败:', err.message);
}

// 3. 小程序侧盘点报告（PDF）
console.log('\n--- 小程序侧盘点报告（generateReport 云函数） ---');
try {
  await miniAppReports('casual_records', 'casual', '随手盘');
} catch (err) {
  console.error('[小程序报告] casual 报告导出失败:', err.message);
}
try {
  await miniAppReports('inventory_records', 'inventory', '正常盘');
} catch (err) {
  console.error('[小程序报告] inventory 报告导出失败:', err.message);
}

console.log('\n=== 导出验证完成，文件已保存到桌面 ===');
