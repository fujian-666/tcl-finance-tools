// 统一从 .env / .env.local 读取凭据，避免把密钥硬编码进源码。
// 已存在的进程环境变量优先（PM2 注入的 PORT 等不会被覆盖）。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadEnv() {
  for (const file of ['.env', '.env.local']) {
    const p = path.join(__dirname, file);
    try {
      if (!fs.existsSync(p)) continue;
      for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq <= 0) continue;
        const key = t.slice(0, eq).trim();
        let value = t.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = value;
      }
    } catch (err) {
      console.warn(`[env] 读取 ${file} 失败:`, err.message);
    }
  }
  return process.env;
}

export function requireEnv(key) {
  loadEnv();
  const v = process.env[key];
  if (!v) {
    console.error(`[env] 缺少 ${key}，请在项目根目录 .env 中配置后重试`);
    process.exit(1);
  }
  return v;
}

export default loadEnv;
