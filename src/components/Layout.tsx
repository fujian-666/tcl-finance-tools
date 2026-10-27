import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { platformStats, slogan } from '../data/tools';
import { isLoggedIn, logout } from '../lib/api';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === '/';

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-bg-primary relative">
      <header className="sticky top-0 z-50 bg-bg-primary/70 backdrop-blur-2xl border-b border-white/[0.03]">
        <div className="absolute inset-0 bg-gradient-to-r from-accent-blue/[0.015] via-transparent to-accent-purple/[0.015]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="flex items-center justify-between h-14">
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="w-[108px] h-[40px] rounded-lg bg-white flex items-center justify-center overflow-hidden shadow-[0_0_16px_-2px_rgba(255,255,255,0.18),0_0_40px_-6px_rgba(255,255,255,0.1)] group-hover:shadow-[0_0_24px_-2px_rgba(255,255,255,0.28),0_0_56px_-6px_rgba(255,255,255,0.18)] transition-all duration-500">
                <img src="/TCL.png" alt="TCL" className="w-[125%] h-[125%] max-w-none object-contain brightness-110 contrast-110" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-xs font-semibold text-rainbow group-hover:text-white transition-colors tracking-wide">
                  TCL华南大区 · 财务小工具平台
                </h1>
              </div>
            </Link>

            <div className="flex items-center gap-2.5">
              {!isHome && (
                <Link
                  to="/"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-white/[0.04] transition-all duration-300"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  首页
                </Link>
              )}
              <h2 className="text-xs font-bold tracking-tight bg-white/[0.02] px-2.5 py-1.5 rounded-lg border border-white/[0.04] text-rainbow">
                付建 个人轻应用合集
              </h2>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-accent-green/5 border border-accent-green/15">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-accent-green shadow-[0_0_4px_rgba(16,185,129,0.5)]" />
                </span>
                <span className="text-[10px] font-medium text-accent-green tracking-wide">
                  {platformStats.status}
                </span>
              </div>
              <span className="text-[10px] text-text-muted hidden sm:inline px-2 py-1 rounded-md bg-white/[0.02] border border-white/[0.03]">
                {platformStats.platformVersion}
              </span>
              {isLoggedIn() && (
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-all duration-300"
                  title="退出登录"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  退出
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="sticky top-14 z-40 bg-bg-card/50 backdrop-blur-2xl border-b border-white/[0.03]">
        <div className="absolute inset-0 bg-gradient-to-r from-accent-blue/[0.03] via-accent-purple/[0.03] to-accent-cyan/[0.03] animate-shimmer" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 relative">
          <div className="flex items-center justify-center gap-2.5">
            <span className="hidden sm:inline-block w-5 h-px bg-gradient-to-r from-transparent to-accent-purple/30" />
            <p className="text-xs font-semibold text-rainbow tracking-[0.12em] drop-shadow-[0_0_10px_rgba(139,92,246,0.35)]">
              业务伙伴 · 财务使命 · 直面痛点 · 服务前端
            </p>
            <span className="hidden sm:inline-block w-5 h-px bg-gradient-to-l from-transparent to-accent-purple/30" />
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 relative">
        <Outlet />
      </main>

      <footer className="border-t border-white/[0.03] mt-16 relative">
        <div className="absolute inset-0 bg-gradient-to-r from-accent-blue/[0.008] via-transparent to-accent-purple/[0.008]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 relative">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-[11px] text-text-muted">
              <span>© 2026 TCL华南大区 · 财务小工具平台</span>
              <span className="hidden sm:inline w-1 h-1 rounded-full bg-text-muted/30" />
              <span className="text-rainbow">{slogan}</span>
            </div>
            <a
              href="mailto:fujian6@tcl.com"
              className="flex items-center gap-1.5 text-[11px] text-text-muted hover:text-accent-blue transition-colors duration-300 group"
            >
              <svg className="w-3 h-3 group-hover:text-accent-blue transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              fujian6@tcl.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}