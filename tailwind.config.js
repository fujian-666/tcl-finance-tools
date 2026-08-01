/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#0A0A0F',
        'bg-card': '#1A1A2E',
        'bg-card-hover': '#222240',
        'accent-blue': '#3B82F6',
        'accent-cyan': '#06B6D4',
        'accent-green': '#10B981',
        'accent-purple': '#8B5CF6',
        'text-primary': '#F1F5F9',
        'text-secondary': '#94A3B8',
        'text-muted': '#64748B',
        'border-subtle': 'rgba(255,255,255,0.06)',
        'border-card': 'rgba(255,255,255,0.08)',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
      },
      animation: {
        'pulse-green': 'pulseGreen 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-in-right': 'slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'toast-progress': 'toastProgress linear forwards',
        'result-flash-success': 'resultFlashSuccess 0.6s ease-out',
        'result-flash-error': 'resultFlashError 0.6s ease-out',
        'shimmer': 'shimmer 2s infinite',
        'card-pulse': 'cardPulse 4s ease-in-out infinite',
      },
      keyframes: {
        pulseGreen: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(100%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        toastProgress: {
          '0%': { width: '100%' },
          '100%': { width: '0%' },
        },
        resultFlashSuccess: {
          '0%': { borderColor: 'rgba(16, 185, 129, 0.8)', boxShadow: '0 0 30px -5px rgba(16, 185, 129, 0.5)' },
          '100%': { borderColor: 'rgba(16, 185, 129, 0.15)', boxShadow: '0 0 10px -5px rgba(16, 185, 129, 0.1)' },
        },
        resultFlashError: {
          '0%': { borderColor: 'rgba(239, 68, 68, 0.8)', boxShadow: '0 0 30px -5px rgba(239, 68, 68, 0.5)' },
          '100%': { borderColor: 'rgba(239, 68, 68, 0.15)', boxShadow: '0 0 10px -5px rgba(239, 68, 68, 0.1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        cardPulse: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.005)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}