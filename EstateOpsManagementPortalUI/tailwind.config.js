/** Every colour, radius, shadow and z-index is a CSS variable (src/index.css) so the
 * tenant theme can override them at runtime without a rebuild. */
const rgb = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const tone = (name) => ({ bg: rgb(`tone-${name}-bg`), fg: rgb(`tone-${name}-fg`) });

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        canvas: rgb('color-canvas'),
        surface: rgb('color-surface'),
        'surface-muted': rgb('color-surface-muted'),
        border: rgb('color-border'),
        content: rgb('color-content'),
        'content-muted': rgb('color-content-muted'),
        primary: rgb('color-primary'),
        'primary-soft': rgb('color-primary-soft'),
        'primary-contrast': rgb('color-primary-contrast'),
        danger: rgb('color-danger'),
        focus: rgb('color-focus'),
        sidebar: rgb('color-sidebar'),
        'sidebar-content': rgb('color-sidebar-content'),
        'sidebar-active': rgb('color-sidebar-active'),
        tone: {
          success: tone('success'),
          warning: tone('warning'),
          info: tone('info'),
          danger: tone('danger'),
          neutral: tone('neutral'),
          accent: tone('accent'),
        },
      },
      borderRadius: { token: 'var(--radius)' },
      boxShadow: { token: 'var(--shadow)' },
      fontFamily: { sans: 'var(--font-sans)' },
      zIndex: { dialog: 'var(--z-dialog)', toast: 'var(--z-toast)' },
    },
  },
  plugins: [],
};
