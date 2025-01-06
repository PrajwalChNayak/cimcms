/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'tech': ['Share Tech Mono', 'monospace'],
        'sans': ['Share Tech Mono', 'monospace'], // This makes it the default font
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'gradient': 'gradient 15s ease infinite',
        'float': 'float 6s ease-in-out infinite'
      },
      backgroundSize: {
        'gradient-size': '400% 400%'
      },
      keyframes: {
        gradient: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        float: {
          '0%': {
              transform: 'translateY(0px)',
              opacity: '0'
          },
          '50%': {
              opacity: '1'
          },
          '100%': {
              transform: 'translateY(-60px)',
              opacity: '0'
          }
      }
      }
    },
  },
  plugins: [],
}

