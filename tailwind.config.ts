import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // פלטה תעשייתית נקייה
        ink: '#0f172a',
        panel: '#ffffff',
        muted: '#64748b',
        line: '#e2e8f0',
        ok: '#16a34a',
        okbg: '#dcfce7',
        alert: '#dc2626',
        alertbg: '#fee2e2',
        review: '#d97706',
        reviewbg: '#fef3c7',
        brand: '#1d4ed8',
        brandbg: '#dbeafe',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
