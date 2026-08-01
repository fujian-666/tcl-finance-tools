const fs = require('fs');
const pdfParse = require('pdf-parse');

const buf = fs.readFileSync('C:/Users/FJ/Desktop/7521c4d89f82b955ec0b8d947ea8fef2.pdf');
pdfParse(buf).then(data => {
  console.log('=== PDF信息 ===');
  console.log('页数:', data.numpages);
  console.log('\n=== 文本内容 ===');
  console.log(data.text);
}).catch(e => console.error(e));