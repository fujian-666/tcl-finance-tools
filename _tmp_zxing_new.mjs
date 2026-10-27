// 一次性验证脚本：zxing 解码 1111111111.png（整图 → 多尺度 → 旋转）
import fs from 'fs';
import { Jimp } from 'jimp';
import {
  MultiFormatReader, RGBLuminanceSource, BinaryBitmap, HybridBinarizer,
  DecodeHintType, BarcodeFormat
} from '@zxing/library';

const ORIG = 'C:/Users/FJ/Desktop/1111111111.png';
if (!fs.existsSync(ORIG)) { console.error('文件不存在:', ORIG); process.exit(1) }
const img = await Jimp.read(ORIG);
const W = img.bitmap.width, H = img.bitmap.height;
console.log('图片:', W, 'x', H, '大小:', (fs.statSync(ORIG).size / 1024).toFixed(1), 'KB');

const hints = new Map([
  [DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX, BarcodeFormat.PDF_417,
    BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93,
    BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E, BarcodeFormat.ITF, BarcodeFormat.CODABAR
  ]]
]);

function tryDecode(bitmap, label) {
  try {
    const r = new MultiFormatReader().decode(bitmap, hints);
    const fmt = r.getBarcodeFormat();
    console.log(`✅ [${label}] 格式=${fmt ? fmt.name : '?'} 内容=${r.getText()}`);
    return true;
  } catch (e) { console.log(`❌ [${label}]`); return false; }
}

let done = tryDecode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(W, H, img.bitmap.data))), `整图 ${W}x${H}`);
if (done) process.exit(0);

// 多尺度
for (const s of [0.5, 1.5, 2, 3]) {
  if (done) break;
  const w = Math.round(W * s), h = Math.round(H * s);
  const r = img.clone().resize({ w, h });
  done = tryDecode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(w, h, r.bitmap.data))), `缩放 ${s}x (${w}x${h})`);
}

// 旋转
if (!done) {
  for (const deg of [90, 180, 270]) {
    const v = img.clone().rotate(deg);
    const w = v.bitmap.width, h = v.bitmap.height;
    if (tryDecode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(w, h, v.bitmap.data))), `旋转${deg}°`)) { done = true; break; }
  }
}

if (!done) console.log('=== 解码失败 ===');
