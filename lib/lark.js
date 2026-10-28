// 飞书文件投递：tenant_access_token → 上传文件 → 发消息（三段式）。
// 口径见 issue #6（决策 A：平台侧统一发送，脚本只产文件）。
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { randomBytes } from 'crypto';

const DEFAULT_BASE = 'https://open.feishu.cn';
const TIMEOUT_MS = 30000;

const MIME = {
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.csv': 'text/csv',
  '.zip': 'application/zip',
  '.pdf': 'application/pdf',
};

function baseUrl() {
  return (process.env.FEISHU_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
}

async function postJson(url, body, token) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return res.json();
}

// node-fetch v3 对 undici 的原生 FormData/Blob 兼容不稳，这里手工拼 multipart，
// 只依赖 Buffer，Node 16+ 都能跑。
function buildMultipart(filePath) {
  const boundary = `----TraeLark${randomBytes(8).toString('hex')}`;
  const buf = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  const mime = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file_type"\r\n\r\nstream\r\n`
    + `--${boundary}\r\nContent-Disposition: form-data; name="file_name"\r\n\r\n${fileName}\r\n`
    + `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\n`
    + `Content-Type: ${mime}\r\n\r\n`,
    'utf8',
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return {
    body: Buffer.concat([head, buf, tail]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/**
 * 把产物文件发送到飞书。凭据全部来自 .env：
 *   FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_NOTIFY_OPEN_ID
 * 任一缺失则不发送（返回 {ok:false, skipped:true}），不影响主流程。
 * 只负责返回结果，不打印日志、不抛异常。
 *
 * @param {{filePath:string, toolName?:string, openId?:string}} opts
 * @returns {Promise<{ok:boolean, skipped?:boolean, reason?:string, messageId?:string}>}
 */
export async function deliverArtifact({ filePath, toolName = '', openId } = {}) {
  const appId = process.env.FEISHU_APP_ID || '';
  const appSecret = process.env.FEISHU_APP_SECRET || '';
  const receiveId = openId || process.env.FEISHU_NOTIFY_OPEN_ID || '';
  if (!appId || !appSecret || !receiveId) {
    return { ok: false, skipped: true, reason: '未配置 FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_NOTIFY_OPEN_ID' };
  }
  if (!filePath || !fs.existsSync(filePath)) {
    return { ok: false, reason: `产物不存在: ${filePath}` };
  }

  // 1) tenant_access_token
  const tokenRes = await postJson(`${baseUrl()}/open-apis/auth/v3/tenant_access_token/internal`, {
    app_id: appId,
    app_secret: appSecret,
  });
  if (tokenRes.code !== 0 || !tokenRes.tenant_access_token) {
    return { ok: false, reason: `获取 tenant_access_token 失败: [${tokenRes.code}] ${tokenRes.msg || ''}` };
  }
  const token = tokenRes.tenant_access_token;

  // 2) 上传文件，拿 file_key
  const { body, contentType } = buildMultipart(filePath);
  const upRes = await fetch(`${baseUrl()}/open-apis/im/v1/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const upJson = await upRes.json();
  const fileKey = upJson?.data?.file_key;
  if (upJson.code !== 0 || !fileKey) {
    return { ok: false, reason: `上传文件失败: [${upJson.code}] ${upJson.msg || ''}` };
  }

  // 3) 发消息（msg_type=file 的 content 就是 file_key）
  const msgRes = await postJson(
    `${baseUrl()}/open-apis/im/v1/messages?receive_id_type=open_id`,
    {
      receive_id: receiveId,
      msg_type: 'file',
      content: JSON.stringify({ file_key: fileKey }),
    },
    token,
  );
  if (msgRes.code !== 0) {
    return { ok: false, reason: `发送消息失败: [${msgRes.code}] ${msgRes.msg || ''}` };
  }
  return { ok: true, messageId: msgRes?.data?.message_id || '' };
}
