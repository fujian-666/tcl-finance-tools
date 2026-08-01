import fs from 'fs';
import pdfParse from 'pdf-parse';

const buf = fs.readFileSync('C:/Users/FJ/Desktop/7521c4d89f82b955ec0b8d947ea8fef2.pdf');
const data = await pdfParse(buf);
console.log('=== PDF信息 ===');
console.log('页数:', data.numpages);
console.log('页面信息:', JSON.stringify(data.info, null, 2));
console.log('\n=== 文本内容 ===');
console.log(data.text);
console.log('\n=== 原始文本行 ===');
data.text.split('\n').forEach((l, i) => console.log(i, '|', l));