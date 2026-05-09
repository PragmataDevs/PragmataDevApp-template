/** @see ../tailwind.config.js — mismos tokens, rutas content del pilar público */
import base from '../tailwind.config.js';

/** @type {import('tailwindcss').Config} */
export default {
  ...base,
  content: [
    './src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}',
    './src/layouts/**/*.astro',
  ],
};
