module.exports = {
  apps: [
    {
      name: 'tcl-backend',
      script: 'server.js',
      cwd: __dirname,
      // 只跑一个进程：server.js 同时托管 API 与 dist 静态产物，
      // 生产不再需要 tcl-frontend（vite dev server 只用于本地开发）。
      max_memory_restart: '300M',
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,
      kill_timeout: 5000,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: '3005',
        PYTHONUNBUFFERED: '1',
        PATH: 'C:\\Users\\FJ\\AppData\\Local\\Python\\pythoncore-3.14-64;C:\\Users\\FJ\\AppData\\Local\\Python\\pythoncore-3.14-64\\Scripts;C:\\Users\\FJ\\Trae\\.venv\\Scripts;C:\\Program Files\\nodejs;' + (process.env.PATH || ''),
        PLAYWRIGHT_BROWSERS_PATH: 'C:\\Users\\FJ\\AppData\\Local\\ms-playwright',
      },
      error_file: 'C:\\Users\\FJ\\.pm2\\logs\\tcl-backend-error.log',
      out_file: 'C:\\Users\\FJ\\.pm2\\logs\\tcl-backend-out.log',
    },
  ],
};