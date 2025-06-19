/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: "#856292",
        "primary-hover": "#8E76A1",
        "primary-press": "#988BB0",
        secondary: "#FF617F",
        "secondary-hover": "#FF849B",
        "secondary-press": "#FF9EB1",
        base: "#FBE2CA",
        "text-primary": "#514062",
      },
      fontFamily: {
        'M_PLUS_2': ['Montserrat', 'M PLUS 2', 'sans-serif'],
        'Montserrat': ['Montserrat', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
