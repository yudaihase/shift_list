/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        salon: {
          beige: {
            50: '#FBF8F4',
            100: '#F5EFE6',
            200: '#EDE3D3',
            300: '#E0D0BA',
            400: '#CBB89D',
            500: '#B5A082',
          },
          mint: {
            50: '#F0F7F4',
            100: '#DCEEE6',
            200: '#B8DDCE',
            300: '#8FC9B0',
            400: '#67B091',
            500: '#4E9A7C',
            600: '#3D7D63',
          },
          ink: {
            700: '#4A4A42',
            800: '#3A3A33',
            900: '#2A2A25',
          },
        },
      },
      fontFamily: {
        sans: ['"Hiragino Sans"', '"Hiragino Kaku Gothic ProN"', '"Noto Sans JP"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
