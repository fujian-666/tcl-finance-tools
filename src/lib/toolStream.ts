/**
 * 工具运行状态流式订阅（服务端 SSE + fetch ReadableStream）。
 *
 * 为什么不用 EventSource：鉴权走 x-auth-token 请求头，EventSource 无法设置请求头。
 * 用 fetch 读流自己解析 SSE 帧，同时保留自动重连（指数退避，最长 30s）。
 *
 * 相比原来的 1s/2s 轮询：
 *  - 日志是增量推送，不再每秒全量重传整个数组；
 *  - 一次连接拿快照 + 实时事件，不再有请求叠加把浏览器同源连接占满；
 *  - 断线可见（onError），不会像轮询那样"连续失败 5 次就报后端挂了"。
 */
import { getToken } from './api';

export interface ToolStatusEvent {
  running: boolean;
  startTime?: string | null;
  message?: string | null;
  exitCode?: number;
  endTime?: string;
  timeoutMs?: number;
}

export interface ToolSnapshot extends ToolStatusEvent {
  logs: string[];
}

export interface ToolStreamHandlers {
  onSnapshot: (s: ToolSnapshot) => void;
  onLog: (line: string) => void;
  onStatus: (s: ToolStatusEvent) => void;
  onError?: (err: Error, attempt: number) => void;
}

export function subscribeToolStream(id: string, handlers: ToolStreamHandlers): () => void {
  let closed = false;
  let controller: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;

  const dispatch = (event: string, payload: unknown) => {
    if (event === 'snapshot') handlers.onSnapshot(payload as ToolSnapshot);
    else if (event === 'log') handlers.onLog((payload as { line: string }).line);
    else if (event === 'status') handlers.onStatus(payload as ToolStatusEvent);
  };

  const connect = async (): Promise<void> => {
    controller = new AbortController();
    try {
      const token = getToken();
      const res = await fetch(`/api/tools/${id}/stream`, {
        headers: token ? { 'x-auth-token': token } : {},
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      attempt = 0;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!closed) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep = buffer.indexOf('\n\n');
        while (sep >= 0) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          let event = 'message';
          const dataLines: string[] = [];
          for (const line of frame.split('\n')) {
            if (line.startsWith(':')) continue;                 // 心跳帧
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
          }
          if (dataLines.length) {
            try {
              dispatch(event, JSON.parse(dataLines.join('\n')));
            } catch { /* 坏帧直接丢弃，不影响后续帧 */ }
          }
          sep = buffer.indexOf('\n\n');
        }
      }
    } catch (err) {
      if (!closed) handlers.onError?.(err as Error, attempt + 1);
    }
    if (closed) return;
    attempt += 1;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(attempt, 5));
    retryTimer = setTimeout(() => { void connect(); }, delay);
  };

  void connect();

  return () => {
    closed = true;
    controller?.abort();
    if (retryTimer) clearTimeout(retryTimer);
  };
}
