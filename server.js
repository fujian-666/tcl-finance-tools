import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import net from 'net';
import readline from 'readline';
import { fileURLToPath } from 'url';
import multer from 'multer';
import iconv from 'iconv-lite';
import XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3004;

// Resolve Python path (SYSTEM account may not have it in PATH)
// 多级回退策略，确保总能找到 Python
let PYTHON_CMD = 'python';

function resolvePython() {
  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || 'C:\\', 'AppData', 'Local');
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';

  // 1. 检查项目 venv（最优先：隔离且可复现）
  const venvPython = path.join(__dirname, '..', '.venv', 'Scripts', 'python.exe');
  if (fs.existsSync(venvPython)) {
    console.log(`[Backend] Python resolved via venv: ${venvPython}`);
    return venvPython;
  }

  // 2. 动态扫描 Python 安装目录（自动发现版本）
  const pythonBase = path.join(localAppData, 'Python');
  try {
    if (fs.existsSync(pythonBase)) {
      const entries = fs.readdirSync(pythonBase, { withFileTypes: true });
      const dirs = entries
        .filter(e => e.isDirectory() && e.name.startsWith('pythoncore-'))
        .map(e => e.name)
        .sort()
        .reverse();
      for (const dir of dirs) {
        const p = path.join(pythonBase, dir, 'python.exe');
        if (fs.existsSync(p)) {
          console.log(`[Backend] Python resolved via scan: ${p}`);
          return p;
        }
      }
    }
  } catch (_) { /* continue */ }

  // 3. 检查常见安装路径
  const knownPaths = [
    path.join(__dirname, '..', '..', 'python-sdk', 'python3.13.2', 'python.exe'),
    path.join(localAppData, 'Programs', 'Python', 'Python314', 'python.exe'),
    path.join(localAppData, 'Programs', 'Python', 'Python313', 'python.exe'),
    path.join(localAppData, 'Programs', 'Python', 'Python312', 'python.exe'),
    path.join(programFiles, 'Python314', 'python.exe'),
    path.join(programFiles, 'Python313', 'python.exe'),
    path.join(programFiles, 'Python312', 'python.exe'),
  ];
  for (const p of knownPaths) {
    if (fs.existsSync(p)) {
      console.log(`[Backend] Python resolved via known path: ${p}`);
      return p;
    }
  }

  // 4. Try 'where python' (system PATH) — filter out WindowsApps stub
  try {
    const whereResult = execSync('where python 2>nul', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    const lines = whereResult.trim().split('\n').filter(l => l.trim());
    for (const line of lines) {
      const cmd = line.trim();
      if (cmd.includes('WindowsApps')) continue;
      if (fs.existsSync(cmd)) {
        console.log(`[Backend] Python resolved via PATH: ${cmd}`);
        return cmd;
      }
    }
  } catch (_) { /* continue */ }

  // 5. Fallback
  console.log('[Backend] WARNING: Python not found, using default "python"');
  return 'python';
}

PYTHON_CMD = resolvePython();
console.log(`[Backend] Final Python command: ${PYTHON_CMD}`);

app.use(cors({ exposedHeaders: ['Content-Disposition'] }));
app.use(express.json());

const toolScripts = {
  'invoice-ocr': {
    name: '华南大区电子发票识别工具',
    script: path.join(__dirname, '..', 'watchdog_server.py'),
    url: 'http://127.0.0.1:8765',
    port: 8765,
  },
  'abnormal-payment': {
    name: '收款异常未录入自动化提醒',
    script: path.join(__dirname, '..', '收款异常未录入自动化提醒.py'),
  },
  'overdue-collection': {
    name: '月末应收逾期自动化催收',
    script: path.join(__dirname, '..', '月末应收逾期自动化催收.py'),
  },
  'deepseek-monitor': {
    name: '自费流量监控自动化',
    script: path.join(__dirname, '..', '自费流量监控自动化（Deepseek）.py'),
  },
  'unpaid-collection': {
    name: '华南大区空调品类合同外未兑付自动化催办',
    script: path.join(__dirname, '..', 'auto_export.py'),
  },
  'rebate-unpaid': {
    name: '华南大区空调品类合同内未兑付自动化催办',
    script: path.join(__dirname, '..', 'auto_export_rebate.py'),
  },
  'subsidy-tracking': {
    name: '华南大区空调品类补贴跟进表',
    script: path.join(__dirname, '..', 'auto_export_subsidy.py'),
  },
  'settlement-freeze': {
    name: '华南大区客户费用明细报表',
    script: path.join(__dirname, '..', 'settlement_freeze_export.py'),
  },
  'settlement-gross-profit': {
    name: '华南大区毛利及费用明细报表',
    script: path.join(__dirname, '..', 'settlement_gross_profit_export.py'),
  },
  'settlement-adjust': {
    name: '华南大区调整项明细报表',
    script: path.join(__dirname, '..', 'settlement_adjust_export.py'),
  },
  'oa-approval': {
    name: 'OA审批助手',
    script: path.join(__dirname, '..', 'oa_approval.py'),
  },
  'cash-application-query': {
    name: '兑现申请单据查询',
    script: path.join(__dirname, '..', 'tof_cash_export.py'),
  },
};

const runningProcesses = new Map();
const completedProcesses = new Map();
const processLogs = new Map();  // id -> string[] log buffer
const processResults = new Map();  // id -> object (for OA approval structured results)

// 持久化运行次数
const callCountPath = path.join(__dirname, 'call_counts.json');
function loadCallCounts() {
  try {
    if (fs.existsSync(callCountPath)) {
      return JSON.parse(fs.readFileSync(callCountPath, 'utf-8'));
    }
  } catch (e) { console.error('Failed to load call counts:', e.message); }
  return {};
}
function saveCallCounts(counts) {
  try {
    fs.writeFileSync(callCountPath, JSON.stringify(counts, null, 2), 'utf-8');
  } catch (e) { console.error('Failed to save call counts:', e.message); }
}
function incrementCallCount(id) {
  const counts = loadCallCounts();
  counts[id] = (counts[id] || 0) + 1;
  saveCallCounts(counts);
  return counts[id];
}
function getCallCounts() {
  return loadCallCounts();
}

const monitorData = {
  balance: null,
  consumption: null,
  lastCheck: null,
  status: 'idle',
};

const monitorDataPath = path.join(__dirname, 'monitor_data.json');

function loadMonitorData() {
  try {
    if (fs.existsSync(monitorDataPath)) {
      const raw = fs.readFileSync(monitorDataPath, 'utf-8');
      const saved = JSON.parse(raw);
      monitorData.balance = saved.balance || null;
      monitorData.consumption = saved.consumption || null;
      monitorData.lastCheck = saved.lastCheck || null;
      console.log('[Monitor] Loaded saved data:', { balance: monitorData.balance, consumption: monitorData.consumption });
    }
  } catch (_) {}
}

function saveMonitorData() {
  try {
    fs.writeFileSync(monitorDataPath, JSON.stringify({
      balance: monitorData.balance,
      consumption: monitorData.consumption,
      lastCheck: monitorData.lastCheck,
    }, null, 2));
  } catch (_) {}
}

function parseMonitorFromLog() {
  const logPath = path.join(__dirname, '..', 'deepseek_monitor.log');
  try {
    if (fs.existsSync(logPath)) {
      const logContent = fs.readFileSync(logPath, 'utf-8');

      const jsonMatches = [...logContent.matchAll(/"balance":\s*"([\d.]+)"[^}]*"consumption":\s*"([\d.]+)"/g)];
      if (jsonMatches.length > 0) {
        const last = jsonMatches[jsonMatches.length - 1];
        monitorData.balance = last[1];
        monitorData.consumption = last[2];
        console.log('[Monitor] Parsed from log JSON:', { balance: monitorData.balance, consumption: monitorData.consumption });
        saveMonitorData();
        return;
      }

      const balanceMatches = [...logContent.matchAll(/充值余额[：:]\s*[¥$]\s*([\d,.]+)/g)];
      if (balanceMatches.length > 0) {
        monitorData.balance = balanceMatches[balanceMatches.length - 1][1].replace(/,/g, '');
      }
      const consumptionMatches = [...logContent.matchAll(/本月消费[：:]\s*[¥$]\s*([\d,.]+)/g)];
      if (consumptionMatches.length > 0) {
        monitorData.consumption = consumptionMatches[consumptionMatches.length - 1][1].replace(/,/g, '');
      }
      if (balanceMatches.length > 0 || consumptionMatches.length > 0) {
        console.log('[Monitor] Parsed from log file:', { balance: monitorData.balance, consumption: monitorData.consumption });
        saveMonitorData();
      }
    }
  } catch (_) {}
}

function checkPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.connect(port, '127.0.0.1');
  });
}

loadMonitorData();
parseMonitorFromLog();

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

app.get('/api/tools/invoice-ocr/status', async (_req, res) => {
  const alive = await checkPort(8765);
  res.json({ running: alive, url: alive ? 'http://127.0.0.1:8765' : null });
});

app.get('/api/tools', (_req, res) => {
  const tools = Object.entries(toolScripts).map(([id, info]) => ({
    id,
    name: info.name,
    running: runningProcesses.has(id),
  }));
  res.json(tools);
});

// 获取所有工具的运行次数
app.get('/api/tools/call-counts', (_req, res) => {
  res.json(getCallCounts());
});

// 获取单个工具的运行次数
app.get('/api/tools/:id/call-count', (req, res) => {
  const counts = getCallCounts();
  res.json({ count: counts[req.params.id] || 0 });
});

function killExistingProcesses(scriptPath) {
  try {
    const scriptName = path.basename(scriptPath);
    const output = execSync('tasklist /FO CSV /NH', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    const lines = output.trim().split('\n');
    for (const line of lines) {
      const parts = line.replace(/"/g, '').split(',');
      if (parts.length >= 2 && parts[0].toLowerCase() === 'python.exe') {
        const pid = parseInt(parts[1]);
        if (!isNaN(pid) && pid > 0) {
          try {
            const cmdline = execSync(`wmic process where processid=${pid} get commandline /value`, { 
              encoding: 'utf-8', 
              stdio: ['ignore', 'pipe', 'pipe'] 
            });
            if (cmdline.includes(scriptName)) {
              console.log(`[Backend] Killing stale process: ${scriptName} (PID ${pid})`);
              execSync(`taskkill /F /PID ${pid}`);
            }
          } catch (_) {}
        }
      }
    }
  } catch (_) {}
}

app.post('/api/tools/:id/run', async (req, res) => {
  const { id } = req.params;
  const tool = toolScripts[id];

  if (!tool) {
    return res.status(404).json({ error: '工具不存在' });
  }

  killExistingProcesses(tool.script);

  if (runningProcesses.has(id)) {
    return res.status(409).json({ error: '工具正在运行中' });
  }

  const isInvoiceOcr = id === 'invoice-ocr';
  const isMonitor = id === 'deepseek-monitor';
  const isSubsidy = id === 'subsidy-tracking';
  const isFreeze = id === 'settlement-freeze';
  const isGrossProfit = id === 'settlement-gross-profit';
  const isAdjust = id === 'settlement-adjust';
  const isCashApp = id === 'cash-application-query';
  const isOA = id === 'oa-approval';

  if (isInvoiceOcr) {
    const alreadyRunning = await checkPort(tool.port);
    if (alreadyRunning) {
      return res.json({ success: true, message: `${tool.name} 已在运行`, url: tool.url });
    }
  }

  // 构建命令行参数
  let args = ['-u', tool.script];
  if (isMonitor) {
    args.push('--no-lark');
  }
  if (isSubsidy) {
    const { startDate, endDate } = req.body || {};
    if (startDate) {
      args.push('--start-date', startDate);
    }
    if (endDate) {
      args.push('--end-date', endDate);
    }
  }
  if (isFreeze) {
    const { startDate, endDate } = req.body || {};
    if (startDate) {
      args.push('--start-date', startDate);
    }
    if (endDate) {
      args.push('--end-date', endDate);
    }
  }
  if (isGrossProfit) {
    const { startDate, endDate } = req.body || {};
    if (startDate) {
      args.push('--start-date', startDate);
    }
    if (endDate) {
      args.push('--end-date', endDate);
    }
  }
  if (isAdjust) {
    const { startDate, endDate } = req.body || {};
    if (startDate) {
      args.push('--start-date', startDate);
    }
    if (endDate) {
      args.push('--end-date', endDate);
    }
  }
  if (isCashApp) {
    const { startDate, endDate } = req.body || {};
    if (startDate) {
      args.push('--start-date', startDate);
    }
    if (endDate) {
      args.push('--end-date', endDate);
    }
  }
  if (isOA) {
    const { oaUrl } = req.body || {};
    if (oaUrl) {
      args.push('--url', oaUrl);
    } else {
      return res.status(400).json({ error: '请提供OA审批链接' });
    }
  }

  const child = spawn(PYTHON_CMD, args, {
    cwd: path.dirname(tool.script),
    detached: false,
    stdio: isMonitor ? 'pipe' : ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
      PLAYWRIGHT_BROWSERS_PATH: 'C:\\Users\\FJ\\AppData\\Local\\ms-playwright',
      PATH: `C:\\Program Files\\nodejs;C:\\Users\\FJ\\AppData\\Roaming\\npm;${process.env.PATH || ''}`,
      USERPROFILE: 'C:\\Users\\FJ',
      HOME: 'C:\\Users\\FJ',
    },
  });

  // 初始化日志缓冲区
  processLogs.set(id, []);

  // 在函数作用域声明，供两个 markCompleted 闭包共用
  let killTimer, keepaliveRef;

  if (!isMonitor) {
    const toolName = tool.name;
    // 完成关键词 — 当 Python 脚本打印这些词时，立即标记为完成
    const COMPLETE_KEYWORDS = ['任务完成', '导出失败，任务终止', '任务完成: 导出并发送成功'];
    const FAIL_KEYWORDS = ['导出失败，任务终止', '发送失败'];

    // 标记任务完成的统一函数（关键词检测 / exit / close / keepalive 共用）
    const markCompleted = (exitCode, msg) => {
      if (completedProcesses.has(id)) return;
      clearTimeout(killTimer);
      completedProcesses.set(id, {
        exitCode,
        endTime: new Date().toISOString(),
        message: msg || (exitCode === 0 ? '运行完成' : `异常退出 (code ${exitCode})`),
      });
      runningProcesses.delete(id);
      if (keepaliveRef) { clearInterval(keepaliveRef); keepaliveRef = null; }
      console.log(`[${toolName}] 标记完成: exitCode=${exitCode}, message=${msg}`);
      setTimeout(() => {
        completedProcesses.delete(id);
        processLogs.delete(id);
        processResults.delete(id);
      }, 5 * 60 * 1000);
    };

    const checkCompletionKeywords = (line) => {
      const isComplete = COMPLETE_KEYWORDS.some(k => line.includes(k));
      const isFail = FAIL_KEYWORDS.some(k => line.includes(k));
      if (isComplete || isFail) {
        console.log(`[${toolName}] 检测到完成关键词: "${line.trim()}" → ${isFail ? '失败' : '成功'}`);
        markCompleted(isFail ? 1 : 0, isFail ? '运行失败' : '运行完成');
      }
    };

    // 用 readline 按行读取，避免 chunk 截断导致关键词匹配失败
    // OA结果捕获状态
    let oaResultCapture = false;
    let oaResultBuffer = '';

    const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    rl.on('line', (line) => {
      console.log(`[${toolName}] ${line}`);
      if (processLogs.has(id)) processLogs.get(id).push(line);
      checkCompletionKeywords(line);

      // OA审批：捕获结构化结果JSON
      if (isOA) {
        if (line.includes('===RESULT_JSON===')) {
          oaResultCapture = true;
          oaResultBuffer = '';
        } else if (line.includes('===END_RESULT===')) {
          oaResultCapture = false;
          try {
            const parsed = JSON.parse(oaResultBuffer.trim());
            processResults.set(id, parsed);
            console.log(`[${toolName}] 审批意见已解析:`, JSON.stringify(parsed).substring(0, 200));
          } catch (_) {
            console.log(`[${toolName}] 结果JSON解析失败`);
          }
        } else if (oaResultCapture) {
          oaResultBuffer += line;
        }
      }
    });
    rl.on('close', () => {
      console.log(`[${toolName}] stdout 已关闭`);
    });

    if (child.stderr) {
      const rlErr = readline.createInterface({ input: child.stderr, crlfDelay: Infinity });
      rlErr.on('line', (line) => {
        console.error(`[${toolName}] ${line}`);
        if (processLogs.has(id)) processLogs.get(id).push(line);
        checkCompletionKeywords(line);
      });
    }
  }

  runningProcesses.set(id, {
    process: child,
    startTime: new Date().toISOString(),
  });

  if (isInvoiceOcr) {
    const waitForServer = async () => {
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const alive = await checkPort(tool.port);
        if (alive) {
          console.log(`[${tool.name}] Server is up on port ${tool.port}`);
          runningProcesses.delete(id);
          return;
        }
      }
      console.log(`[${tool.name}] Server did not start within 20s`);
      runningProcesses.delete(id);
    };
    waitForServer().catch((err) => {
      console.error(`[${tool.name}] waitForServer error:`, err.message);
      runningProcesses.delete(id);
    });
  }

  if (isMonitor && child.stdout) {
    monitorData.status = 'running';
    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    child.on('close', (code) => {
      runningProcesses.delete(id);
      completedProcesses.set(id, {
        exitCode: code,
        endTime: new Date().toISOString(),
        message: code === 0 ? '监控完成' : `异常退出 (code ${code})`,
      });
      setTimeout(() => completedProcesses.delete(id), 5 * 60 * 1000);
      monitorData.status = 'idle';
      monitorData.lastCheck = new Date().toISOString();

      const logPath = path.join(path.dirname(tool.script), 'deepseek_monitor.log');
      let searchText = output;
      try {
        if (fs.existsSync(logPath)) {
          const logContent = fs.readFileSync(logPath, 'utf-8');
          searchText = logContent + '\n' + output;
        }
      } catch (_) {}

      const jsonMatches = [...searchText.matchAll(/"balance":\s*"([\d.]+)"[^}]*"consumption":\s*"([\d.]+)"/g)];
      if (jsonMatches.length > 0) {
        const last = jsonMatches[jsonMatches.length - 1];
        monitorData.balance = last[1];
        monitorData.consumption = last[2];
      } else {
        const balanceMatches = [...searchText.matchAll(/充值余额[：:]\s*[¥$]\s*([\d,.]+)/g)];
        if (balanceMatches.length > 0) {
          monitorData.balance = balanceMatches[balanceMatches.length - 1][1].replace(/,/g, '');
        }
        const consumptionMatches = [...searchText.matchAll(/本月消费[：:]\s*[¥$]\s*([\d,.]+)/g)];
        if (consumptionMatches.length > 0) {
          monitorData.consumption = consumptionMatches[consumptionMatches.length - 1][1].replace(/,/g, '');
        }
      }

      console.log('[Monitor] Parsed data:', { balance: monitorData.balance, consumption: monitorData.consumption });
      saveMonitorData();
    });
  } else if (!isInvoiceOcr) {
    // stdout/stderr 已由 readline 按行处理（见上方 if (!isMonitor) 块），此处不再重复监听

    const KILL_TIMEOUT = 15 * 60 * 1000;
    killTimer = setTimeout(() => {
      if (runningProcesses.has(id)) {
        console.log(`[${tool.name}] 超过 ${KILL_TIMEOUT / 60000} 分钟，强制终止 PID=${child.pid}`);
        if (process.platform === 'win32') {
          // Windows 上 SIGTERM 无效，用 taskkill
          try { require('child_process').execSync(`taskkill /F /PID ${child.pid} /T`, { timeout: 10000 }); } catch (_) {}
        } else {
          try { child.kill('SIGTERM'); } catch (_) {}
          setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} }, 5000);
        }
        markCompleted(-1, '运行超时自动终止');
      }
    }, KILL_TIMEOUT);

    // 标记任务完成的统一函数
    const markCompleted = (exitCode, msg) => {
      if (completedProcesses.has(id)) return;
      clearTimeout(killTimer);
      completedProcesses.set(id, {
        exitCode,
        endTime: new Date().toISOString(),
        message: msg || (exitCode === 0 ? '运行完成' : `异常退出 (code ${exitCode})`),
      });
      runningProcesses.delete(id);
      if (keepaliveRef) { clearInterval(keepaliveRef); keepaliveRef = null; }
      console.log(`[${tool.name}] 标记完成: exitCode=${exitCode}, message=${msg}`);
      setTimeout(() => {
        completedProcesses.delete(id);
        processLogs.delete(id);
        processResults.delete(id);
      }, 5 * 60 * 1000);
    };

    // exit 事件 — 进程退出时立即触发，不依赖 stdout 流状态
    child.on('exit', (code, signal) => {
      console.log(`[${tool.name}] Process exit: code=${code}, signal=${signal}`);
      markCompleted(code || (signal ? 1 : 0), code === 0 ? '运行完成' : `异常退出 (code ${code})`);
    });

    // close 事件 — 兜底，stream 关闭时触发
    child.on('close', (code) => {
      console.log(`[${tool.name}] Process close: code=${code}`);
      markCompleted(code, code === 0 ? '运行完成' : `异常退出 (code ${code})`);
    });

    // keepalive 兜底：每10秒检查进程是否还活着
    keepaliveRef = setInterval(() => {
      if (completedProcesses.has(id)) { clearInterval(keepaliveRef); return; }
      try {
        process.kill(child.pid, 0); // 信号0不杀进程，只检查是否存在
      } catch {
        // 进程已不存在
        console.log(`[${tool.name}] keepalive 检测到进程已退出`);
        markCompleted(0, '运行完成（进程已退出）');
        clearInterval(keepaliveRef);
      }
    }, 10000);
  }

  child.on('error', (err) => {
    console.error(`[${tool.name}] Spawn error:`, err.message);
    completedProcesses.set(id, {
      exitCode: -1,
      endTime: new Date().toISOString(),
      message: `启动失败: ${err.message}`,
    });
    setTimeout(() => completedProcesses.delete(id), 5 * 60 * 1000);
    runningProcesses.delete(id);
    if (isMonitor) {
      monitorData.status = 'error';
    }
  });

  // 持久化运行次数 +1
  const newCount = incrementCallCount(id);
  console.log(`[${tool.name}] 运行次数: ${newCount}`);

  const responseData = {
    success: true,
    message: `${tool.name} 已启动`,
    pid: child.pid,
    callCount: newCount,
  };

  if (isInvoiceOcr && tool.url) {
    responseData.url = tool.url;
  }

  res.json(responseData);
});

app.get('/api/tools/:id/status', (req, res) => {
  const { id } = req.params;
  const running = runningProcesses.get(id);
  console.log(`[STATUS] ${id} polled: running=${!!running}, completed=${completedProcesses.has(id)}`);

  if (running) {
    res.json({
      running: true,
      startTime: running.startTime,
      message: running.message || null,
    });
  } else {
    // 检查是否有已结束的进程信息（通过 exitCode 缓存）
    const completed = completedProcesses.get(id);
    if (completed) {
      res.json({
        running: false,
        exitCode: completed.exitCode,
        message: completed.message,
        endTime: completed.endTime,
      });
    } else {
      res.json({ running: false });
    }
  }
});

app.post('/api/tools/:id/stop', async (req, res) => {
  const { id } = req.params;
  const running = runningProcesses.get(id);

  if (!running) {
    return res.status(404).json({ error: '工具未在运行' });
  }

  try {
    execSync(`taskkill /F /PID ${running.process.pid}`);
  } catch {
    try { running.process.kill('SIGTERM'); } catch {}
    setTimeout(() => {
      try { running.process.kill('SIGKILL'); } catch {}
    }, 2000);
  }

  runningProcesses.delete(id);
  console.log(`[Backend] Stopped process: ${id}`);
  res.json({ success: true, message: '已停止' });
});

app.get('/api/tools/deepseek-monitor/data', (_req, res) => {
  res.json(monitorData);
});

// OA审批结果接口
app.get('/api/tools/:id/result', (req, res) => {
  const { id } = req.params;
  const result = processResults.get(id);
  if (result) {
    res.json(result);
  } else {
    res.json(null);
  }
});

// ==================== OA审批：文本分析接口 ====================
const DEEPSEEK_API_KEY = '***REDACTED***';
const DEEPSEEK_CHAT_API = 'https://api.deepseek.com/v1/chat/completions';
const OA_TEMPLATES_PATH = path.join(__dirname, '..', 'oa_templates.json');
const OA_LEARN_DIR = path.join(__dirname, '..', 'oa_learned');

function loadOATemplates() {
  try {
    if (fs.existsSync(OA_TEMPLATES_PATH)) {
      return JSON.parse(fs.readFileSync(OA_TEMPLATES_PATH, 'utf-8'));
    }
  } catch (_) {}
  return { templates: [] };
}

function saveOATemplates(templates) {
  try {
    fs.writeFileSync(OA_TEMPLATES_PATH, JSON.stringify(templates, null, 2), 'utf-8');
  } catch (_) {}
}

function saveOALearning(oaType, content, opinion, templateId) {
  try {
    if (!fs.existsSync(OA_LEARN_DIR)) fs.mkdirSync(OA_LEARN_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const safeName = oaType.replace(/[/\\ ]/g, '_').substring(0, 40);
    const file = path.join(OA_LEARN_DIR, `${ts}_${safeName}.json`);
    fs.writeFileSync(file, JSON.stringify({
      learned_at: new Date().toISOString(),
      oa_type: oaType,
      template_id: templateId,
      page_summary: content.substring(0, 2000),
      generated_opinion: opinion,
    }, null, 2), 'utf-8');
    console.log(`[OA] 学习记忆已保存: ${path.basename(file)}`);
  } catch (e) { console.error('[OA] 保存学习记忆失败:', e.message); }
}

function matchOATemplates(content, templates) {
  const list = templates.templates || [];
  return list.filter(t => {
    const pattern = t.url_pattern || '';
    // 也用关键词匹配
    const keywords = t.content_keywords || [];
    const keywordMatch = keywords.length > 0 && keywords.some(kw => content.includes(kw));
    return keywordMatch;
  });
}

async function callDeepSeekAI(content, matchedTemplates, allTemplates) {
  let systemPrompt;

  if (matchedTemplates.length > 0) {
    const hasAnalysisRules = matchedTemplates.some(t => t.analysis_rules);
    const tmplDesc = matchedTemplates.map((t, i) => {
      let desc = `类型${i + 1} (id=${t.id}, name=${t.name})：
关键词：${(t.content_keywords || []).join(', ')}
模板格式：${t.template || ''}
字段：${JSON.stringify(t.fields || [])}
示例：${JSON.stringify(t.example || {})}`;
      if (t.analysis_rules) {
        desc += `\n📊 Excel取数规则：${JSON.stringify(t.analysis_rules, null, 2)}`;
      }
      return desc;
    }).join('\n\n');

    const analysisInstruction = hasAnalysisRules
      ? '\n\n⚠️ 重要：附件为Excel数据。请严格按"📊 Excel取数规则"从附件取数。边际贡献率取合计行，负边际型号筛选单品边际贡献(额)负数的型号。'
      : '';

    systemPrompt = `你是TCL华南大区的OA审批助手。根据OA正文和附件Excel，选最匹配的模板生成审批意见。${analysisInstruction}

${tmplDesc}

返回JSON：
{
  "oa_type": "类型名称",
  "template_id": "模板id",
  "matched": true,
  "summary": {"字段": "值"},
  "opinion": "完整审批意见"
}`;
  } else {
    systemPrompt = `你是TCL华南大区的OA审批助手。这是一个新的OA类型，请推断并生成审批意见。

已知模板供参考：${JSON.stringify(allTemplates, null, 2)}

意见格式：先写前置背景（如有），标题行，逐条关键数据（分号结尾），以"以上XXX，请领导批示！"结尾。

返回JSON：
{
  "oa_type": "new",
  "matched": false,
  "summary": {"标题": "", "关键事项": []},
  "opinion": "完整审批意见",
  "new_template": {"id": "建议id", "name": "类型名", "url_pattern": "", "content_keywords": [], "fields": [], "template": "模板"}
}`;
  }

  const resp = await fetch(DEEPSEEK_CHAT_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `OA页面内容（含附件）：\n\n${content.substring(0, 15000)}` },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    }),
  });

  if (!resp.ok) throw new Error(`DeepSeek API ${resp.status}`);
  const result = await resp.json();
  return JSON.parse(result.choices[0].message.content);
}

app.post('/api/tools/oa-approval/analyze', async (req, res) => {
  try {
    const { content, attachments } = req.body || {};
    if (!content || !content.trim()) {
      return res.json({ success: false, error: '请提供OA内容' });
    }

    const fullContent = attachments ? `${content}\n\n===== 附件内容 =====\n${attachments}` : content;
    const templates = loadOATemplates();
    const matched = matchOATemplates(fullContent, templates);

    console.log(`[OA] 分析请求: ${content.length}字符正文 + ${(attachments || '').length}字符附件, 匹配${matched.length}个模板`);

    const aiResult = await callDeepSeekAI(fullContent, matched, templates);

    // 保存学习记忆
    const oaType = aiResult.oa_type || 'unknown';
    saveOALearning(oaType, content, aiResult.opinion || '', aiResult.template_id || '');

    // 如果是新类型，自动入库
    if (!aiResult.matched && aiResult.new_template) {
      const tpl = aiResult.new_template;
      const list = templates.templates || [];
      if (!list.find(t => t.id === tpl.id)) {
        list.push(tpl);
        templates.templates = list;
        saveOATemplates(templates);
        console.log(`[OA] 已学习新类型: ${tpl.id}`);
        aiResult.learned = true;
      }
    }

    res.json({
      success: true,
      ...aiResult,
    });
  } catch (e) {
    console.error('[OA] 分析失败:', e.message);
    res.json({ success: false, error: 'AI分析失败', message: e.message });
  }
});

// 实时日志接口
app.get('/api/tools/:id/logs', (req, res) => {
  const { id } = req.params;
  const logs = processLogs.get(id) || [];
  res.json({ logs, count: logs.length });
});

// ==================== 微信 CloudBase API 直连 ====================
const WX_APPID = 'wx1739c040ef86b472';
const WX_SECRET = '1b79aa3a1b03c0179fc2f3e70dbffd0e';
const TCB_ENV = 'cloud1-d0g8kgm7o08c2d228';
const MAX_LIMIT = 100;

let wxAccessToken = null;
let wxTokenExpiry = 0;

async function getAccessToken() {
  if (wxAccessToken && Date.now() < wxTokenExpiry) return wxAccessToken;
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WX_APPID}&secret=${WX_SECRET}`;
  const resp = await fetch(url);
  const data = await resp.json();
  if (data.access_token) {
    wxAccessToken = data.access_token;
    wxTokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
    console.log('[Backend] WeChat access_token refreshed');
    return wxAccessToken;
  }
  throw new Error('Failed to get access_token: ' + JSON.stringify(data));
}

async function tcbApi(method, query, retry = true) {
  const token = await getAccessToken();
  const url = `https://api.weixin.qq.com/tcb/${method}?access_token=${token}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ env: TCB_ENV, query })
  });
  const data = await resp.json();
  if (data.errcode === 40001 && retry) {
    // token 过期，清掉缓存重试一次
    wxAccessToken = null;
    return tcbApi(method, query, false);
  }
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`TCB API error: ${data.errcode} ${data.errmsg}`);
  }
  return data;
}

async function dbCount(collection, conditions = {}) {
  const where = JSON.stringify(conditions);
  const data = await tcbApi('databasecount', `db.collection('${collection}').where(${where}).count()`);
  return data.total || data.count || 0;
}

async function dbList(collection, conditions = {}) {
  const where = JSON.stringify(conditions);
  let allData = [];
  let offset = 0;
  const totalRes = await tcbApi('databasecount', `db.collection('${collection}').where(${where}).count()`);
  const total = totalRes.count || totalRes.total || 0;
  if (total === 0) return [];
  while (offset < total) {
    const data = await tcbApi('databasequery', `db.collection('${collection}').where(${where}).skip(${offset}).limit(${MAX_LIMIT}).get()`);
    const items = (data.data || []).map(item => typeof item === 'string' ? JSON.parse(item) : item);
    allData = allData.concat(items);
    if (items.length < MAX_LIMIT) break;
    offset += MAX_LIMIT;
  }
  return allData;
}

async function dbAdd(collection, record) {
  const doc = JSON.stringify(record);
  const data = await tcbApi('databaseadd', `db.collection('${collection}').add({data:${doc}})`);
  return data.id_list?.[0] || data._id;
}

async function dbRemove(collection, docId) {
  await tcbApi('databasedelete', `db.collection('${collection}').doc('${docId}').remove()`);
}

async function fetchAllRecords(collectionName, conditions = {}) {
  return dbList(collectionName, conditions);
}

const upload = multer({ dest: path.join(__dirname, 'uploads') });

// ==================== 统一数据访问层 ====================

function parseCSV(buffer) {
  let csvString = iconv.decode(buffer, 'cp936');
  if (csvString.charCodeAt(0) === 0xFEFF) {
    csvString = csvString.slice(1);
  }
  
  const lines = csvString.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length < 2) return { headers: [], rows: [], isSAPFormat: false };
  
  // 检测SAP导出格式（第1行含"序号"则为3行表头）
  const isSAPFormat = lines[0] && lines[0].includes('序号');
  const dataStartRow = isSAPFormat ? 3 : 1;
  
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(dataStartRow).map(line => parseCSVLine(line));
  
  return { headers, rows, isSAPFormat };
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

app.post('/api/inventory/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.json({ success: false, message: '请选择文件' });
    }
    
    const collectionName = req.body.collection || 'fixed_asset_records';
    const buffer = fs.readFileSync(req.file.path);
    const ext = path.extname(req.file.originalname || '').toLowerCase();
    let headers, rows, isSAPFormat;

    if (ext === '.xlsx' || ext === '.xls') {
      // 解析 xlsx 文件，支持多工作表
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      headers = null;
      rows = [];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const sheetData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
        // 跳过前2行（标题行 + 分公司信息行），第3行是表头
        const dataStartIdx = sheetData.findIndex(row => {
          if (!row[0]) return false;
          const h = String(row[0]);
          return h.includes('仓库名称') || h.includes('产品型号') || h.includes('大区') || h.includes('战区');
        });
        if (dataStartIdx < 0 && sheetData.length < 3) continue;
        const headerIdx = dataStartIdx >= 0 ? dataStartIdx : 2;
        const sheetHeaders = sheetData[headerIdx].map(h => String(h || '').trim());
        if (dataStartIdx < 0) headers = sheetHeaders;
        // 数据从表头下一行开始
        for (let i = headerIdx + 1; i < sheetData.length; i++) {
          const row = sheetData[i];
          // 遇到空行或"制表人"行则停止
          if (!row || row.every(c => !c)) break;
          const firstCell = String(row[0] || '').trim();
          if (firstCell.includes('制表人') || firstCell.includes('盘点要求') || firstCell.startsWith('1、')) break;
          // 如果第一列不是仓库名（可能是空或短文本），确认是有数据的行
          const vals = row.map(c => String(c || '').trim());
          rows.push(vals);
          if (!headers) headers = sheetHeaders;
        }
      }
      isSAPFormat = false;
    } else {
      // 原有的 CSV 解析逻辑
      ({ headers, rows, isSAPFormat } = parseCSV(buffer));
    }
    
    fs.unlinkSync(req.file.path);
    
    if (rows.length === 0) {
      return res.json({ success: false, message: '文件中没有数据' });
    }
    
    const isFixedAsset = collectionName === 'fixed_asset_records';
    
    const mappedRecords = rows.map((vals) => {
      const record = {};
      
      if (isFixedAsset && isSAPFormat) {
        // SAP导出格式：按列位置映射
        record['资产名称'] = vals[5] || '';
        record['资产代码'] = vals[1] || '';
        record['公司代码'] = vals[2] || '';
        record['资产分类'] = vals[4] || '';
        record['型号'] = vals[6] || '';
        record['数量'] = vals[7] || '';
        record['战区'] = vals[24] || '';
        record['部门负责人'] = vals[25] || '';
        record['盘点人'] = vals[26] || '';
        record['盘点数量'] = parseInt(vals[27]) || parseInt(vals[7]) || 0;
        record['实盘数量'] = parseInt(vals[28]) || 0;
        record['资产状态'] = vals[35] || '正常使用';
        record['使用部门'] = vals[36] || '';
        record['使用人'] = vals[37] || '';
        record['使用地点'] = vals[38] || '';
        record['保管人'] = vals[37] || '';
      } else {
        // 通用格式：按表头名称映射
        const fieldMap = isFixedAsset ? {
          '资产名称': ['资产名称', '产品名称', '名称', '资产'],
          '资产代码': ['资产代码', '资产编号', '编号', '公司编码+资产编码', '公司编码', '公司代码+资产代码'],
          '战区': ['战区', '区域'],
          '盘点数量': ['盘点数量', '数量'],
          '实盘数量': ['实盘数量', '实盘数'],
          '保管人': ['保管人', '使用人', '责任人'],
          '使用部门': ['使用部门', '部门', '信息变更：使用部门'],
          '使用地点': ['使用地点', '存放地点', '信息变更：使用地点'],
          '备注': ['备注'],
          '资产状态': ['资产状态', '状态'],
          '型号': ['型号'],
          '门店': ['门店', '仓库名称', '存放地点'],
          '规格型号': ['规格型号', '型号'],
          'SN': ['SN', '机身码', '序列号'],
          'Project Name': ['Project Name', '项目名称']
        } : {
          '大区': ['大区'],
          '战区': ['战区'],
          '仓库名称': ['仓库名称（分品类）', '仓库名称', '门店'],
          '产品线': ['品类', '产品线'],
          '产品型号': ['产品型号', '型号'],
          '库存': ['库存', '盘点数量'],
          '实盘数': ['实盘数', '实盘数量'],
          '机身码': ['机身码', 'SN', '序列号'],
          '备注': ['备注'],
          '盘点人': ['盘点人']
        };
        
        for (const [targetField, sourceFields] of Object.entries(fieldMap)) {
          for (const sourceField of sourceFields) {
            const headerIndex = headers.indexOf(sourceField);
            if (headerIndex >= 0) {
              const value = vals[headerIndex];
              if (value !== undefined && value !== null && value !== '') {
                record[targetField] = value;
                break;
              }
            }
          }
        }
      }
      
      record.createTime = new Date();
      record.updateTime = new Date();
      record.lastScanTime = new Date();
      
      if (isFixedAsset) {
        if (record['实盘数量'] === undefined) record['实盘数量'] = 0;
        if (record['盘点数量'] === undefined) record['盘点数量'] = 0;
        if (record['资产状态'] === undefined || record['资产状态'] === '') record['资产状态'] = '正常使用';
      } else {
        // 从仓库名称中提取战区（适配 HF-深圳战区...、WP-深圳战区...、ZN-深圳战区... 等格式）
        if (record['仓库名称'] && !record['战区']) {
          const match = record['仓库名称'].match(/([^-]+战区)/);
          if (match) record['战区'] = match[1];
        }
        // 从战区推导大区
        if (record['战区'] && !record['大区']) {
          const ZONE_REGION_MAP = {
            '深圳战区': '华南大区', '广州战区': '华南大区', '长沙战区': '华南大区',
            '福州战区': '华南大区', '南宁战区': '华南大区', '东莞战区': '华南大区',
          };
          record['大区'] = ZONE_REGION_MAP[record['战区']] || '';
        }
        if (record['库存'] !== undefined) record['库存'] = parseInt(record['库存']) || 0;
        if (record['实盘数'] === undefined) record['实盘数'] = 0;
      }
      
      return record;
    });
    
    const validRecords = isFixedAsset
      ? mappedRecords.filter(row => {
          const name = row['资产名称'] || '';
          return name && !name.includes('保管人') && !name.includes('备注');
        })
      : mappedRecords.filter(row => row['产品型号']);
    
    // 先读取旧记录 ID（暂不删除，防止插入失败时数据丢失）
    const oldRecords = await fetchAllRecords(collectionName);
    const oldIds = new Set(oldRecords.map(r => r._id));

    // 先插入新数据
    let successCount = 0;
    let failCount = 0;
    // 批量并发插入，每批 20 条
    const BATCH = 20;
    for (let i = 0; i < validRecords.length; i += BATCH) {
      const batch = validRecords.slice(i, i + BATCH);
      const results = await Promise.allSettled(batch.map(r => dbAdd(collectionName, r)));
      results.forEach(r => {
        if (r.status === 'fulfilled') successCount++;
        else { console.error('导入单条失败:', r.reason?.message); failCount++; }
      });
    }

    // 插入成功后再批量删除旧记录
    let deletedCount = 0;
    // 批量并发删除
    const oldArr = [...oldIds];
    for (let i = 0; i < oldArr.length; i += BATCH) {
      const batch = oldArr.slice(i, i + BATCH);
      const results = await Promise.allSettled(batch.map(id => dbRemove(collectionName, id)));
      results.forEach(r => { if (r.status === 'fulfilled') deletedCount++; });
    }
    
    res.json({
      success: true,
      message: `导入完成，清除旧数据 ${deletedCount} 条，成功导入 ${successCount} 条，失败 ${failCount} 条`,
      successCount,
      failCount,
      deletedCount,
      totalCount: validRecords.length,
      preview: validRecords.slice(0, 5)
    });
  } catch (err) {
    console.error('导入失败:', err);
    res.json({ success: false, message: '导入失败：' + err.message });
  }
});

app.get('/api/inventory/export', async (req, res) => {
  try {
    const collectionName = req.query.collection || 'fixed_asset_records';
    const format = req.query.format || 'csv';

    const conditions = {};
    if (req.query.zone) {
      conditions['战区'] = req.query.zone;
    }
    if (req.query.store) {
      conditions['仓库名称'] = req.query.store;
    }

    // 使用统一数据访问层获取全部记录
    const rawData = await fetchAllRecords(collectionName, conditions);
    
    const isFixedAsset = collectionName === 'fixed_asset_records';
    const _NON_INVENTORY_TYPES = ['confirmation', 'signature', 'checkin'];
    
    // 完全对齐小程序 cloud.js getAllInventoryRecordsForExport 的过滤逻辑：
    // 1) 排除 recordType 为 confirmation/signature/checkin 的非盘点记录
    // 2) 样机盘点必须有盘点人和产品型号；固定资产必须有盘点人和资产代码/资产名称
    const filteredData = rawData.filter(item => {
      if (item.recordType && _NON_INVENTORY_TYPES.includes(item.recordType)) return false;
      if (isFixedAsset) return item['盘点人'] && (item['资产代码'] || item['资产名称']);
      return item['盘点人'] && item['产品型号'];
    });
    console.log(`[Export] 原始=${rawData.length} 有效=${filteredData.length}`);
    
    if (filteredData.length === 0) {
      return res.json({ success: false, message: '没有数据可导出' });
    }
    
    // ====== 第一步：应用与小程序 getAllInventoryRecordsForExport 完全一致的数据映射 ======
    const mappedData = isFixedAsset ? filteredData.map(item => ({
      _id: item._id,
      资产代码: item['资产代码'] || '',
      公司代码: item['公司代码'] || '',
      资产: item['资产'] || '',
      资产分类描述: item['资产分类描述'] || item['资产分类'] || '',
      资产名称: item['资产名称'] || '',
      型号: item['型号'] || '',
      数量: parseInt(item['数量']) || 0,
      资本化日期: item['资本化日期'] || '',
      不活动日期: item['不活动日期'] || '',
      资产主号文本: item['资产主号文本'] || '',
      库存地址: item['库存地址'] || '',
      资产管理员: item['资产管理员'] || '',
      资产类型: item['资产类型'] || '',
      报销单号: item['报销单号'] || '',
      购置日期: item['购置日期'] || '',
      购置价值: parseFloat(item['购置价值']) || 0,
      累计折旧: parseFloat(item['累计折旧']) || 0,
      净值: parseFloat(item['净值']) || 0,
      减值准备: parseFloat(item['减值准备']) || 0,
      账面价值: parseFloat(item['账面价值']) || 0,
      原值: parseFloat(item['原值']) || 0,
      功能范围: item['功能范围'] || '',
      WBS描述: item['WBS描述'] || '',
      战区: item['战区'] || '',
      部门负责人: item['部门负责人'] || '',
      盘点人: item['盘点人'] || '',
      盘点数量: parseInt(item['盘点数量']) || 0,
      实盘数量: parseInt(item['实盘数量']) || 0,
      使用部门: item['使用部门'] || '',
      使用人: item['使用人'] || '',
      使用地点: item['使用地点'] || '',
      资产状态: item['资产状态'] || '',
      备注: item['备注'] || '',
    })) : filteredData.map(item => ({
      _id: item._id,
      大区: item['大区'] || '',
      战区: item['战区'] || '',
      仓库名称: item['仓库名称'] || '',
      产品线: item['品类'] || item['产品线'] || '',
      产品型号: item['产品型号'] || '',
      库存: parseInt(item['库存']) || 0,
      实盘数: parseInt(item['实盘数']) || 0,
      机身码: item['机身码'] || '',
      备注: item['备注'] || '',
      盘点人: item['盘点人'] || '',
    }));
    
    // ====== 第二步：使用与小程序 exportExcel 云函数完全一致的字段键和表头 ======
    const fieldKeys = isFixedAsset
      ? ['序号', '资产代码', '公司代码', '资产', '资产分类描述', '资产名称', '型号', '数量', '资本化日期', '不活动日期', '资产主号文本', '库存地址', '资产类型', '报销单号', '购置日期', '购置价值', '累计折旧', '净值', '减值准备', '账面价值', '原值', '功能范围', 'WBS描述', '战区', '部门负责人', '盘点人', '盘点数量', '实盘数量', '资产状态', '使用部门', '使用人', '使用地点', '备注']
      : ['大区', '战区', '仓库名称', '产品线', '产品型号', '库存', '实盘数', '机身码', '备注', '盘点人'];

    const headerNames = isFixedAsset
      ? ['序号', '公司代码+资产代码', '公司代码', '资产', '资产分类描述', '资产名称', '型号', '数量', '资本化日期', '不活动日期', '资产主号文本', '库存注记', '资产类型名', '固定资产报销单号', '购置资产日期', '购置价值', '累计折旧', '净值', '减值准备', '账面价值', '原值', '功能范围', 'WBS描述', '战区/部门', '部门负责人', '盘点人', '盘点数量', '实盘数量', '信息变更', '资产状态', '使用部门', '使用人', '使用地点', '备注']
      : ['序号', '大区', '战区', '仓库名称（分品类）', '产品线', '产品型号', '库存', '实盘数', '机身码', '备注', '盘点人'];

    // 构建数据行，序号自动补
    let rows = mappedData.map((item, i) => {
      if (isFixedAsset) {
        return fieldKeys.map(key => {
          if (key === '序号') return i + 1;
          return item[key] !== undefined ? item[key] : '';
        });
      }
      const r = fieldKeys.map(key => item[key] !== undefined ? item[key] : '');
      r.unshift(i + 1); // 序号放第一列
      return r;
    });
    
    const headers = headerNames;
    
    // 从数据中提取仓库名称作为文件名
    let exportName = '全部盘点明细';
    if (!isFixedAsset && mappedData.length > 0) {
      const warehouseNames = [...new Set(mappedData.map(r => (r['仓库名称'] || '').trim()).filter(Boolean))];
      if (warehouseNames.length === 1) {
        exportName = `${warehouseNames[0]}盘点明细`;
      } else if (warehouseNames.length > 1) {
        const zone = req.query.zone || '';
        exportName = zone ? `${zone}盘点明细` : '盘点门店明细';
      }
    } else if (isFixedAsset) {
      const zone = req.query.zone || '';
      exportName = zone ? `${zone}盘点明细` : '盘点门店';
    }
    
    if (format === 'xlsx') {
      // 本地生成 Excel，格式与小程序 exportExcel 云函数完全一致
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '盘点门店');
      
      // 列宽设置与云函数 exportExcel 完全一致
      const colWidths = headers.map(name => {
        if (name === '机身码' || name === '备注') return { wch: 25 };
        if (name === '产品型号' || name === '仓库名称（分品类）') return { wch: 18 };
        return { wch: 12 };
      });
      worksheet['!cols'] = colWidths;
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      const xlsxFilename = `${exportName}.xlsx`;
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(xlsxFilename)}`);
      res.send(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
    } else if (format === 'pdf') {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 24 });
      doc.registerFont('CN', 'C:/Windows/Fonts/simhei.ttf');
      res.setHeader('Content-Type', 'application/pdf');
      const pdfFilename = `${exportName.replace('盘点明细', '盘点报告')}.pdf`;
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(pdfFilename)}`);
      doc.pipe(res);
      const pageW = doc.page.width;
      const m = 24;

      // 顶线
      doc.rect(0, 0, pageW, 3).fill('#1a3a5c');
      // Logo
      try {
        const logoPath = 'F:/桌面右边/TCLlogo_transparent.png';
        if (fs.existsSync(logoPath)) doc.image(logoPath, m, 8, { width: 52 });
      } catch (_) {}
      // 标题
      doc.fontSize(12).font('CN').fill('#1a3a5c').text('TCL智能科技（宁波）有限公司', m, 16, { align: 'center' });
      doc.fontSize(12).fill('#1a3a5c').text(isFixedAsset ? '固定资产盘点报告' : '样机盘点报告', m, doc.y + 2, { align: 'center' });
      doc.moveTo(m, doc.y + 8).lineTo(pageW - m, doc.y + 8).stroke('#cccccc');

      // 查询签名数据（含签名图片）
      let checkerName = '', confirmerName = '', certId = '', notice = null;
      let checkerB64 = '', confirmerB64 = '';
      try {
        const sigRecords = await dbList(collectionName, { recordType: 'signature' });
        if (sigRecords.length > 0) {
          const r = sigRecords[0];
          checkerName = r['盘点人'] || '';
          confirmerName = r['确认人'] || '';
          checkerB64 = r['盘点人签名base64'] || r['checkerB64'] || '';
          confirmerB64 = r['确认人签名base64'] || r['confirmerB64'] || '';
          const cd = r['数字证书'] || null;
          if (cd && cd.certId) certId = cd.certId;
          // 知情同意告知书签署信息（法务存证，仅确认人签署时存在）
          notice = (cd && cd.notice && cd.notice.agreed) ? cd.notice : null;
        }
      } catch (_) {}

      // 表格列定义（与 报告logo2.pdf 一致）
      const colDefs = isFixedAsset ? [
        { label: '序号', w: 24 }, { label: '资产代码', w: 70 }, { label: '资产名称', w: 80 },
        { label: '资产分类', w: 50 }, { label: '型号', w: 45 }, { label: '购置价值', w: 40 },
        { label: '净值', w: 40 }, { label: '战区', w: 40 }, { label: '盘点数量', w: 30 },
        { label: '实盘数量', w: 30 }, { label: '资产状态', w: 40 }, { label: '备注', w: 45 }
      ] : [
        { label: '序号', w: 24 }, { label: '大区', w: 40 }, { label: '战区', w: 44 },
        { label: '仓库名称', w: 100 }, { label: '产品线', w: 36 }, { label: '产品型号', w: 72 },
        { label: '库存', w: 28 }, { label: '实盘数', w: 28 }, { label: '机身码', w: 84 },
        { label: '备注', w: 48 }, { label: '盘点人', w: 44 }
      ];
      const totalW = colDefs.reduce((s, c) => s + c.w, 0);
      const scale = (pageW - m * 2) / totalW;
      colDefs.forEach(c => { c.w = Math.floor(c.w * scale); });
      const tableW = colDefs.reduce((s, c) => s + c.w, 0);
      const rH = 15, hH = 16;
      let y = doc.y + 10;

      // 表头
      doc.fontSize(7).font('CN');
      let x = m;
      doc.rect(x, y, tableW, hH).fill('#1a3a5c');
      doc.fill('#ffffff');
      colDefs.forEach(c => { doc.text(c.label, x + 2, y + 3, { width: c.w - 4, align: 'center', lineBreak: false }); x += c.w; });
      // 表头竖线
      x = m; colDefs.forEach(c => { doc.moveTo(x, y).lineTo(x, y + hH).stroke('#ffffff'); x += c.w; });
      doc.moveTo(x, y).lineTo(x, y + hH).stroke('#ffffff');
      doc.fill('#000000');
      y += hH;

      // 数据行
      doc.fontSize(6.5);
      const pb = doc.page.height - 28;
      rows.forEach((row, ri) => {
        if (y + rH > pb) { doc.addPage(); y = 28; x = m; doc.fontSize(7); doc.rect(x, y, tableW, hH).fill('#1a3a5c'); doc.fill('#ffffff'); colDefs.forEach(c => { doc.text(c.label, x + 2, y + 3, { width: c.w - 4, align: 'center', lineBreak: false }); x += c.w; }); doc.fill('#000000'); y += hH; doc.fontSize(6.5); }
        if (ri % 2 === 0) { doc.rect(m, y, tableW, rH).fill('#f5f7fa').fill('#333333'); }
        // 竖线
        let lx = m; colDefs.forEach(c => { doc.moveTo(lx, y).lineTo(lx, y + rH).lineWidth(0.5).stroke('#b0b8c0'); lx += c.w; });
        doc.moveTo(lx, y).lineTo(lx, y + rH).lineWidth(0.5).stroke('#b0b8c0');
        // 横线
        doc.moveTo(m, y + rH).lineTo(m + tableW, y + rH).lineWidth(0.5).stroke('#b0b8c0');
        x = m;
        row.forEach((cell, ci) => { doc.text(String(cell != null ? cell : ''), x + 2, y + 3, { width: colDefs[ci].w - 4, align: 'center', lineBreak: false }); x += colDefs[ci].w; });
        doc.fill('#000000');
        y += rH;
      });

      // 合计行
      const totalStock = rows.reduce((s, r) => s + (parseInt(r[6]) || 0), 0);
      const totalActual = rows.reduce((s, r) => s + (parseInt(r[7]) || 0), 0);
      doc.fontSize(7).font('CN');
      doc.rect(m, y, tableW, rH).fill('#e8ecf0').fill('#1a3a5c');
      let sx = m;
      colDefs.forEach((c, ci) => {
        let val = '';
        if (ci === 0) val = '合计';
        else if (ci === 6) val = String(totalStock);
        else if (ci === 7) val = String(totalActual);
        doc.text(val, sx + 2, y + 3, { width: c.w - 4, align: 'center', lineBreak: false });
        doc.moveTo(sx, y).lineTo(sx, y + rH).stroke('#b0b8c0');
        sx += c.w;
      });
      doc.moveTo(sx, y).lineTo(sx, y + rH).stroke('#b0b8c0');
      doc.fill('#000000');
      y += rH;
      doc.moveTo(m, y).lineTo(m + tableW, y).stroke('#1a3a5c');

      // 签名区
      const sigY = y + 24;
      doc.fontSize(9).fill('#333333');
      const checkerLabel = `盘点人（电子签名）：${checkerName || '___________'}`;
      const confirmerLabel = `确认人（电子签名）：${confirmerName || '___________'}`;
      doc.text(checkerLabel, m, sigY);
      doc.text(confirmerLabel, m + 260, sigY);
      // 签名图片：紧跟"（电子签名）"文字后面
      const sigImgH = 36;
      if (checkerB64) {
        try {
          const w = doc.widthOfString(checkerLabel);
          doc.image(Buffer.from(checkerB64, 'base64'), m + w + 6, sigY - 12, { height: sigImgH });
        } catch (_) {}
      }
      if (confirmerB64) {
        try {
          const w = doc.widthOfString(confirmerLabel);
          doc.image(Buffer.from(confirmerB64, 'base64'), m + 260 + w + 6, sigY - 12, { height: sigImgH });
        } catch (_) {}
      }
      const hasImg = checkerB64 || confirmerB64;
      if (certId) { doc.fontSize(7).fill('#555555'); doc.text(`签名存证哈希：${certId}`, m, sigY + (hasImg ? sigImgH + 26 : 22)); }
      // 知情同意告知书签署说明（法务存证，随报告归档）
      if (notice) {
        const noticeY = sigY + (hasImg ? sigImgH + 26 : 22) + (certId ? 14 : 0);
        const agreedAt = String(notice.agreedAt || '').replace('T', ' ').replace(/\.\d+Z$/, ' (UTC)');
        doc.fontSize(7).fill('#555555');
        doc.text(`确认人${confirmerName || ''}已阅读并签署《样机盘点知情同意告知书》（v${notice.version || '1.0'}），同意时间：${agreedAt}`, m, noticeY, { width: pageW - m * 2 });
      }

      // 法律声明
      const ft = sigY + (hasImg ? sigImgH + 28 : 12) + (certId ? 34 : 0) + (notice ? 14 : 0);
      if (ft < doc.page.height - 40) {
        doc.moveTo(m, ft).lineTo(pageW - m, ft).stroke('#e0e0e0');
        doc.fontSize(6).fill('#CC0000');
        doc.text('注：根据《中华人民共和国电子签名法》第十四条，可靠的电子签名与手写签名或者盖章具有同等的法律效力。本报告中的电子签名信息已通过数字证书存证，具备法律效力。', m, ft + 6, { width: pageW - m * 2, align: 'left' });
      }
      doc.moveDown(0.5);
      doc.fontSize(7).fillColor('#999999');
      doc.text(`报告生成时间：${new Date().toISOString()}`, { align: 'center' });
      doc.end();
    } else {
      let csv = headers.join(',') + '\n';
      rows.forEach(row => {
        csv += row.map(cell => {
          const val = String(cell);
          if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            return '"' + val.replace(/"/g, '""') + '"';
          }
          return val;
        }).join(',') + '\n';
      });
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      const csvFilename = `盘点门店_${Date.now()}.csv`;
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(csvFilename)}`);
      res.send(csv);
    }
  } catch (err) {
    console.error('导出失败:', err);
    res.json({ success: false, message: '导出失败：' + err.message });
  }
});

app.get('/api/inventory/photos', async (req, res) => {
  try {
    const collectionName = req.query.collection || 'fixed_asset_records';
    const conditions = {};
    if (req.query.zone) {
      conditions['战区'] = req.query.zone;
    }
    
    const data = await fetchAllRecords(collectionName, conditions);
    
    const photos = data
      .filter(row => row['photoFileID'] || row['照片'])
      .map(row => ({
        id: row._id,
        name: row['资产名称'] || row['产品型号'] || 'unknown',
        fileID: row['photoFileID'] || row['照片'],
        zone: row['战区'] || '',
        keeper: row['保管人'] || '',
        updateTime: row['updateTime'] || row['createTime']
      }));
    
    res.json({ success: true, data: photos });
  } catch (err) {
    console.error('获取照片列表失败:', err);
    res.json({ success: false, message: '获取照片列表失败：' + err.message });
  }
});

app.get('/api/inventory/photo/download', async (req, res) => {
  try {
    const fileID = req.query.fileID;
    if (!fileID) {
      return res.json({ success: false, message: '缺少fileID参数' });
    }
    
    const downloadUrl = `https://${TCB_ENV}.tcloudbase.com/${fileID.replace(/^\//, '')}`;
    const response = await fetch(downloadUrl);
    
    if (!response.ok) {
      return res.json({ success: false, message: '下载失败' });
    }
    
    const buffer = await response.buffer();
    const ext = fileID.split('.').pop() || 'jpg';
    
    res.setHeader('Content-Type', `image/${ext === 'png' ? 'png' : 'jpeg'}`);
    res.setHeader('Content-Disposition', `attachment; filename=photo_${Date.now()}.${ext}`);
    res.send(buffer);
  } catch (err) {
    console.error('下载照片失败:', err);
    res.json({ success: false, message: '下载照片失败：' + err.message });
  }
});

app.get('/api/inventory/stats', async (req, res) => {
  try {
    const [fixedCount, invCount] = await Promise.all([
      dbCount('fixed_asset_records'),
      dbCount('inventory_records')
    ]);

    res.json({
      success: true,
      data: {
        fixed_asset_records: fixedCount,
        inventory_records: invCount
      }
    });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 404 处理
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const server = app.listen(PORT, () => {
  console.log(`[Backend] Server running at http://localhost:${PORT}`);
  console.log(`[Backend] Ready to handle requests...`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`[Backend] Port ${PORT} is in use, attempting to free it...`);
    try {
      // 找到占用端口的 PID 并杀掉
      const netstatOut = execSync(`netstat -ano | findstr ":${PORT} " | findstr "LISTENING"`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
      const match = netstatOut.match(/\s+(\d+)\s*$/m);
      if (match) {
        const stalePid = match[1].trim();
        console.log(`[Backend] Killing stale process PID ${stalePid} on port ${PORT}...`);
        execSync(`taskkill /F /PID ${stalePid}`, { stdio: ['ignore', 'pipe', 'pipe'] });
        console.log(`[Backend] Stale process killed, retrying in 2s...`);
      }
    } catch (e) {
      console.log(`[Backend] Could not auto-kill stale process: ${e.message}`);
    }
    // 等 2 秒后重试绑定
    setTimeout(() => {
      app.listen(PORT, () => {
        console.log(`[Backend] Server running at http://localhost:${PORT}`);
      }).on('error', (e2) => {
        console.error(`[Backend] Retry failed: ${e2.message}`);
        process.exit(1);
      });
    }, 2000);
  } else {
    console.error('[Backend] Server error:', err.message);
    process.exit(1);
  }
});

process.on('uncaughtException', (err) => {
  console.error('[Backend] Uncaught exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Backend] Unhandled rejection:', reason);
});

// 优雅关闭：终止所有运行中的子进程
const cleanup = async () => {
  console.log('\n[Backend] Shutting down...');
  try {
    for (const [id, info] of runningProcesses) {
      try {
        console.log(`[Backend] Killing process: ${id} (PID ${info.process.pid})`);
        execSync(`taskkill /F /PID ${info.process.pid}`);
      } catch {
        try { info.process.kill('SIGTERM'); } catch {}
      }
    }
  } catch (_) {}
  runningProcesses.clear();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// 定期清理已退出的僵尸进程
setInterval(() => {
  for (const [id, info] of runningProcesses) {
    if (info.process.exitCode !== null) {
      console.log(`[Backend] Cleaning up completed process: ${id}`);
      runningProcesses.delete(id);
    }
  }
}, 30000);