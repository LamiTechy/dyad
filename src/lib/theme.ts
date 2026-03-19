// Theme configuration with pink/rose glassmorphic design
export const theme = {
  // Primary pink/rose colors
  primary: {
    50: '#fdf2f8',
    100: '#fce7f3',
    200: '#fbcfe8',
    300: '#f8b4d4',
    400: '#f472b6',
    500: '#ec4899',
    600: '#db2777',
    700: '#be185d',
    800: '#9d174d',
    900: '#831843',
  },
  // Glassmorphic backgrounds
  glass: {
    light: 'rgba(255, 255, 255, 0.1)',
    lighter: 'rgba(255, 255, 255, 0.05)',
    dark: 'rgba(0, 0, 0, 0.2)',
  },
  // Neutral/dark theme
  neutral: {
    950: '#0a0a0a', // Near black background
    900: '#111118',
    800: '#1a1a24',
    700: '#27272e',
    600: '#3a3a42',
    500: '#52525b',
    400: '#71717a',
    300: '#a1a1aa',
    200: '#d4d4d8',
    100: '#e4e4e7',
    50: '#f4f4f5',
  },
}

// Glassmorphic effect CSS
export const glassCss = `
  background: rgba(20, 20, 30, 0.7);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
`

// Glassmorphic card style (for rounded containers)
export const glassCardCss = `
  background: rgba(20, 20, 30, 0.5);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(236, 72, 153, 0.2);
  box-shadow: 0 12px 40px rgba(236, 72, 153, 0.15);
`

export default theme
