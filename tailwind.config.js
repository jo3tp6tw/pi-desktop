// 以 CSS 變數 (R G B) 定義顏色，保留 Tailwind 的透明度修飾 (例如 bg-primary/15)
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      // 統一字級比例：取代原本散落的 text-[10px]/[11px]/[11.5px]/[12px]。
      // 整體較原本放大約 1px，且越小的字放大越多，維持一致的視覺比例。
      fontSize: {
        '2xs': ['0.75rem', { lineHeight: '1.35' }], // 12px（原本 10~11.5px 的微標籤）
        xs: ['0.8125rem', { lineHeight: '1.4' }], // 13px（原本 12px 的內文主力）
        sm: ['0.9375rem', { lineHeight: '1.5' }], // 15px（原本 14px 的重點/對話）
        base: ['1.0625rem', { lineHeight: '1.55' }], // 17px（標題）
        lg: ['1.1875rem', { lineHeight: '1.55' }], // 19px
      },
      // 語意色彩：實際色值定義在 src/index.css 的 :root CSS 變數，
      // 元件只用角色名稱（canvas / fg-muted / primary…），不再直接寫色碼。
      colors: {
        canvas: token('canvas'),
        surface: { DEFAULT: token('surface'), 2: token('surface-2') },
        overlay: token('overlay'),
        raised: token('raised'),
        sunken: token('sunken'),
        line: { DEFAULT: token('line'), strong: token('line-strong') },
        fg: {
          strong: token('fg-strong'),
          DEFAULT: token('fg'),
          muted: token('fg-muted'),
          subtle: token('fg-subtle'),
          disabled: token('fg-disabled'),
        },
        primary: { DEFAULT: token('primary'), solid: token('primary-solid') },
        danger: { DEFAULT: token('danger'), solid: token('danger-solid') },
        success: token('success'),
        warning: token('warning'),
        remote: token('remote'),
        link: token('link'),
      },
    },
  },
  plugins: [],
}
