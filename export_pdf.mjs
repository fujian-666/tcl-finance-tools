import cloudbase from '@cloudbase/node-sdk';
import PDFDocument from 'pdfkit';
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


const FONT_PATH = 'C:/Windows/Fonts/simhei.ttf';
const FONT_BOLD = 'C:/Windows/Fonts/simhei.ttf';

const app = cloudbase.init({
  env: process.env.COS_ENV || 'cloud1-db-d5g1771j0b91888c7',
  secretId: process.env.COS_SECRET_ID || '',
  secretKey: process.env.COS_SECRET_KEY || ''
});
const db = app.database();
const desktop = 'C:/Users/FJ/Desktop';

function drawTable(doc, headers, rows, colWidths, startY) {
  const margin = 40;
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const startX = margin;
  let y = startY;
  const rowH = 22;

  // 表头
  doc.fontSize(8).font('CN');
  let x = startX;
  doc.rect(x, y, tableWidth, rowH).fill('#1a3a5c');
  doc.fill('#ffffff');
  headers.forEach((h, i) => {
    doc.text(h, x + 3, y + 5, { width: colWidths[i] - 6, align: 'center' });
    x += colWidths[i];
  });
  doc.fill('#000000');
  y += rowH;

  // 数据行
  doc.fontSize(7).font('CN');
  rows.forEach((row, ri) => {
    if (y > doc.page.height - 60) {
      doc.addPage();
      y = 40;
      x = startX;
      doc.fontSize(8).font('CN');
      doc.rect(x, y, tableWidth, rowH).fill('#1a3a5c');
      doc.fill('#ffffff');
      headers.forEach((h, i) => {
        doc.text(h, x + 3, y + 5, { width: colWidths[i] - 6, align: 'center' });
        x += colWidths[i];
      });
      doc.fill('#000000');
      y += rowH;
      doc.fontSize(7).font('CN');
    }

    x = startX;
    const bg = ri % 2 === 0 ? '#f5f7fa' : '#ffffff';
    doc.rect(x, y, tableWidth, rowH).fill(bg);
    
    // 画竖线
    let lx = startX;
    colWidths.forEach(w => {
      doc.moveTo(lx, y).lineTo(lx, y + rowH).stroke('#d0d5dd');
      lx += w;
    });
    doc.moveTo(lx, y).lineTo(lx, y + rowH).stroke('#d0d5dd');
    
    // 画横线
    doc.moveTo(startX, y + rowH).lineTo(startX + tableWidth, y + rowH).stroke('#d0d5dd');
    
    doc.fill('#333333');
    row.forEach((cell, ci) => {
      doc.text(String(cell !== undefined && cell !== null ? cell : ''), x + 3, y + 5, { width: colWidths[ci] - 6, align: 'center' });
      x += colWidths[ci];
    });
    y += rowH;
  });

  return y;
}

// 分页获取集合全部记录（cloudbase 单次 get 默认最多 100 条）
async function fetchAllRecords(collectionName, maxLimit = 100) {
  let all = []
  let offset = 0
  for (;;) {
    const res = await db.collection(collectionName).skip(offset).limit(maxLimit).get()
    const batch = (res.data || []).map(r => r.data || r)
    all = all.concat(batch)
    if (batch.length < maxLimit) break
    offset += maxLimit
  }
  return all
}

async function generatePDF(collectionName, reportTitle, subtitle, headers, rows, filename, collectionLabel) {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.registerFont('CN', FONT_PATH);
  const stream = fs.createWriteStream(path.join(desktop, filename));
  doc.pipe(stream);

  const pageW = doc.page.width;
  const margin = 40;

  // === 顶部装饰线 ===
  doc.rect(0, 0, pageW, 4).fill('#1a3a5c');

  // === 标题区 ===
  doc.fontSize(20).font('CN').fill('#1a3a5c').text(reportTitle, margin, 25, { align: 'center' });
  doc.fontSize(11).font('CN').fill('#666666').text(subtitle, margin, doc.y + 5, { align: 'center' });
  
  // === 分隔线 ===
  doc.moveTo(margin, doc.y + 12).lineTo(pageW - margin, doc.y + 12).stroke('#1a3a5c');
  
  // === 元信息区 ===
  const infoY = doc.y + 20;
  doc.fontSize(9).font('CN').fill('#333333');
  doc.text(`生成时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`, margin, infoY);
  doc.text(`数据来源：${collectionLabel}（${collectionName}）`, margin, infoY + 16);
  doc.text(`记录总数：${rows.length} 条`, margin, infoY + 32);
  doc.text(`盘点状态：已完成`, margin + 250, infoY + 32);

  // === 表格区域 ===
  const tableStartY = infoY + 60;
  const colWidths = headers.map(h => {
    const base = h.length * 8 + 12;
    return Math.min(150, Math.max(50, base));
  });

  // 调整列宽，使总宽度适合页面
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  const availableW = pageW - margin * 2;
  if (totalW < availableW) {
    const scale = availableW / totalW;
    colWidths.forEach((w, i) => { colWidths[i] = w * scale; });
  }

  drawTable(doc, headers, rows, colWidths, tableStartY);

  // === 底部 ===
  const footerY = doc.page.height - 50;
  doc.moveTo(margin, footerY).lineTo(pageW - margin, footerY).stroke('#cccccc');
  doc.fontSize(8).font('CN').fill('#999999');
  doc.text('华南大区运营资产盘点数据管理后台', margin, footerY + 10, { align: 'left' });
  doc.text(`第 1 页`, margin, footerY + 10, { align: 'right' });

  doc.end();
  return new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

console.log('=== 生成盘点报告PDF ===\n');

// 固定资产（列与 server.js /api/inventory/export?format=pdf 完全一致）
const fixedData = await fetchAllRecords('fixed_asset_records');
const fixedHeaders = ['序号', '资产代码', '资产名称', '资产分类', '型号', '购置价值', '净值', '战区', '盘点数量', '实盘数量', '资产状态', '备注'];
const fixedRows = fixedData.map((row, i) => [
  i + 1, row['资产代码'] || '', row['资产名称'] || '', row['资产分类描述'] || row['资产分类'] || '',
  row['型号'] || '', row['购置价值'] != null ? String(row['购置价值']) : '',
  row['净值'] != null ? String(row['净值']) : '', row['战区'] || '',
  String(parseInt(row['盘点数量']) || 0), String(parseInt(row['实盘数量']) || 0),
  row['资产状态'] || '', row['备注'] || ''
]);
await generatePDF('fixed_asset_records', '固定资产盘点报告', '华南大区 · 运营资产盘点', fixedHeaders, fixedRows, '固定资产盘点报告.pdf', '固定资产');
console.log('✅ 固定资产盘点报告.pdf');

// 样机盘点（列与 server.js /api/inventory/export?format=pdf 完全一致）
const invData = await fetchAllRecords('inventory_records');
const invHeaders = ['序号', '大区', '战区', '仓库名称', '产品线', '产品型号', '库存', '实盘数', '机身码', '备注', '盘点人'];
const invRows = invData.map((row, i) => [
  i + 1, row['大区'] || '', row['战区'] || '', row['仓库名称'] || '',
  row['品类'] || row['产品线'] || '', row['产品型号'] || '',
  String(parseInt(row['库存']) || 0), String(parseInt(row['实盘数']) || 0),
  row['机身码'] || '', row['备注'] || '', row['盘点人'] || ''
]);
await generatePDF('inventory_records', '样机盘点报告', '华南大区 · 运营资产盘点', invHeaders, invRows, '样机盘点报告.pdf', '样机盘点');
console.log('✅ 样机盘点报告.pdf');

console.log('\n✅ PDF报告已生成到桌面');