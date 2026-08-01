const zlib = require('zlib');
const fs = require('fs');

const buf = fs.readFileSync('C:/Users/FJ/Desktop/7521c4d89f82b955ec0b8d947ea8fef2.pdf');
const str = buf.toString('latin1');

// Find image streams
const re = /(\d+ 0 obj[\s\S]*?endobj)/g;
let m;
let imgNum = 0;
while ((m = re.exec(str)) !== null) {
  const obj = m[1];
  if (obj.includes('/Subtype /Image')) {
    const wm = obj.match(/\/Width (\d+)/);
    const hm = obj.match(/\/Height (\d+)/);
    const cm = obj.match(/\/ColorSpace \/(\w+)/);
    const sm = obj.match(/\/SMask (\d+)/);
    if (sm) continue; // skip mask
    
    const streamMatch = obj.match(/stream\r?\n([\s\S]*?)endstream/);
    if (streamMatch) {
      try {
        const raw = Buffer.from(streamMatch[1], 'latin1');
        const decoded = zlib.inflateSync(raw);
        const w = parseInt(wm[1]);
        const h = parseInt(hm[1]);
        const color = cm ? cm[1] : 'DeviceRGB';
        
        imgNum++;
        const outPath = `C:/Users/FJ/Desktop/pdf_img_${imgNum}.png`;
        
        // Write raw RGB data as PPM then convert concept
        // For DeviceRGB: 3 bytes per pixel
        if (color === 'DeviceRGB') {
          // Write as raw RGB
          const ppmHeader = `P6\n${w} ${h}\n255\n`;
          const ppmBuf = Buffer.concat([Buffer.from(ppmHeader), decoded]);
          fs.writeFileSync(outPath.replace('.png', '.ppm'), ppmBuf);
          console.log(`Image ${imgNum}: ${w}x${h}, ${color}, ${decoded.length} bytes -> ${outPath.replace('.png', '.ppm')}`);
        } else {
          // DeviceGray
          const ppmHeader = `P5\n${w} ${h}\n255\n`;
          const ppmBuf = Buffer.concat([Buffer.from(ppmHeader), decoded]);
          fs.writeFileSync(outPath.replace('.png', '.pgm'), ppmBuf);
          console.log(`Image ${imgNum}: ${w}x${h}, ${color}, ${decoded.length} bytes (grayscale)`);
        }
      } catch(e) {
        console.log('解压失败:', e.message);
      }
    }
  }
}
console.log('Done');