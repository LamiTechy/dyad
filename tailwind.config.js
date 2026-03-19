/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
    './src/hooks/**/*.{js,ts,jsx,tsx}',
    './src/lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [
    function ({ addUtilities }) {
      addUtilities({
        '.glass': {
          background: 'rgba(20, 20, 30, 0.7)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderColor: 'rgba(255, 255, 255, 0.1)',
        },
        '.glass-card': {
          background: 'rgba(20, 20, 30, 0.5)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderColor: 'rgba(167, 139, 250, 0.2)',
          boxShadow: '0 12px 40px rgba(167, 139, 250, 0.15)',
        },
        '.glass-button': {
          background: 'rgba(167, 139, 250, 0.2)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderColor: 'rgba(167, 139, 250, 0.3)',
          color: '#a78bfa',
          transition: 'all 0.3s ease',
          '&:hover': {
            background: 'rgba(167, 139, 250, 0.3)',
            boxShadow: '0 0 20px rgba(167, 139, 250, 0.4)',
          },
        },
      })
    },
  ],
}