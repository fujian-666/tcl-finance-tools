import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react({
      jsxRuntime: 'automatic',
    }),
    {
      name: 'fix-refresh-sig',
      transformIndexHtml(html) {
        return html.replace(
          '</head>',
          '<script>window.$RefreshSig$=window.$RefreshSig$||((t)=>(e)=>e);window.$RefreshReg$=window.$RefreshReg$||(()=>{});</script></head>'
        );
      },
    },
  ],
  server: {
    port: 8888,
    proxy: {
      '/api': {
        target: 'http://localhost:3005',
        changeOrigin: true,
      },
      '/deepseek': {
        target: 'https://api.deepseek.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/deepseek/, ''),
      },
    },
  },
})
