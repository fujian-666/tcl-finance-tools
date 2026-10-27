// 同步脚本：将桌面「样机数据库最新.xlsx」导入云数据库 store_options 集合
// 结构：每个大区一条文档 { region, zones: [{ zone, stores: [{ name, legalPerson, storeCode }] }] }
// 用法：node sync-store-options.mjs   （需先 node -e "require('xlsx')" 可用，即在本目录运行）
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 加载 .env / .env.local（凭据禁止硬编码进源码）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnvFile(file) {
  try {
    if (!fs.existsSync(file)) return;
    const content = fs.readFileSync(file, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (_) {}
}
loadEnvFile(path.join(__dirname, '.env'));
loadEnvFile(path.join(__dirname, '.env.local'));

const WX_APPID = process.env.WX_APPID || '';
const WX_SECRET = process.env.WX_SECRET || '';
const TCB_ENV = process.env.TCB_ENV || '';
if (!WX_APPID || !WX_SECRET || !TCB_ENV) {
  console.error('缺少微信云开发凭据：请在 .env 中配置 WX_APPID / WX_SECRET / TCB_ENV');
  process.exit(1);
}
const XLSX_PATH = 'C:\\Users\\FJ\\Desktop\\样机数据库最新.xlsx';
const COLLECTION = 'store_options';

async function getToken() {
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WX_APPID}&secret=${WX_SECRET}`;
  const r = await fetch(url);
  const d = await r.json();
  if (!d.access_token) throw new Error('获取 access_token 失败: ' + JSON.stringify(d));
  return d.access_token;
}

async function tcb(token, method, query) {
  const r = await fetch(`https://api.weixin.qq.com/tcb/${method}?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ env: TCB_ENV, query })
  });
  const d = await r.json();
  if (d.errcode && d.errcode !== 0) throw new Error(`TCB ${method} 失败: ${d.errcode} ${d.errmsg}`);
  return d;
}

// 调用 initDb 云函数确保集合存在（幂等，只创建缺失集合）
async function invokeInitDb(token) {
  const url = `https://api.weixin.qq.com/tcb/invokecloudfunction?access_token=${token}&env=${TCB_ENV}&name=initDb`;
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const j = await r.json();
  let resp = j;
  if (j.resp_data) { try { resp = JSON.parse(j.resp_data) } catch (_) { resp = j.resp_data } }
  const storeState = resp && resp.results && resp.results['store_options'];
  console.log('initDb 集合初始化完成, store_options:', storeState);
}

// 1. 读 xlsx → tree（stores 为对象 { name, legalPerson, storeCode }，按仓库名称去重保留首条）
function buildTree(rows) {
  const regionMap = new Map(); // region -> Map(zone -> Map(store -> storeObj))
  let conflictCount = 0;
  for (const r of rows) {
    const region = String(r['大区'] || '').trim();
    const zone = String(r['战区'] || '').trim();
    const name = String(r['仓库名称'] || '').trim();
    if (!region || !zone || !name) continue;
    const legalPerson = String(r['仓库法人'] || '').trim();
    const storeCode = String(r['仓库编码'] || '').trim();
    if (!regionMap.has(region)) regionMap.set(region, new Map());
    const zoneMap = regionMap.get(region);
    if (!zoneMap.has(zone)) zoneMap.set(zone, new Map());
    const storeMap = zoneMap.get(zone);
    if (!storeMap.has(name)) {
      storeMap.set(name, { name, legalPerson, storeCode });
    } else {
      // 同名仓库法人/编码不一致时告警（保留首条）
      const prev = storeMap.get(name);
      if (prev.legalPerson !== legalPerson || prev.storeCode !== storeCode) {
        conflictCount++;
        console.warn(`  同名仓库信息不一致(${region}/${zone}/${name}): 首条(${prev.legalPerson}/${prev.storeCode}) vs 当前(${legalPerson}/${storeCode})`);
      }
    }
  }
  const tree = [];
  for (const [region, zoneMap] of regionMap) {
    const zones = [];
    for (const [zone, storeMap] of zoneMap) {
      zones.push({ zone, stores: [...storeMap.values()] });
    }
    tree.push({ region, zones });
  }
  console.log('同名仓库信息不一致条数:', conflictCount);
  return tree;
}

async function main() {
  console.log('读取 xlsx:', XLSX_PATH);
  const wb = XLSX.readFile(XLSX_PATH);
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
  console.log('sheet:', sheetName, '行数:', rows.length);

  const tree = buildTree(rows);
  let totalStores = 0;
  for (const t of tree) {
    const s = t.zones.reduce((n, z) => n + z.stores.length, 0);
    totalStores += s;
    console.log(`  大区 ${t.region}: ${t.zones.length} 战区 / ${s} 仓库`);
  }
  console.log('合计仓库:', totalStores);

  const token = await getToken();

  // 2. 调用 initDb 确保集合存在（数据库集合由 initDb 云函数创建）
  await invokeInitDb(token);

  // 3. 清空旧数据
  const list = await tcb(token, 'databasequery', `db.collection('${COLLECTION}').limit(100).get()`);
  const oldIds = (list.data || []).map(i => (typeof i === 'string' ? JSON.parse(i) : i)._id);
  for (const id of oldIds) {
    await tcb(token, 'databasedelete', `db.collection('${COLLECTION}').doc('${id}').remove()`);
  }
  console.log('已清空旧数据:', oldIds.length, '条');

  // 4. 写入新数据（每条大区文档）
  for (const t of tree) {
    const q = `db.collection('${COLLECTION}').add({data:{region:${JSON.stringify(t.region)}, zones:${JSON.stringify(t.zones)}, updatedAt: new Date()}})`;
    await tcb(token, 'databaseadd', q);
  }
  console.log('写入完成:', tree.length, '条大区文档');

  // 5. 验证
  const v = await tcb(token, 'databasecount', `db.collection('${COLLECTION}').count()`);
  console.log('验证 count:', JSON.stringify(v));
}

main().catch(e => { console.error('同步失败:', e.message); process.exit(1); });
