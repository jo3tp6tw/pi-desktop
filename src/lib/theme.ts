// 從 index.css 的 :root 色彩 token（「R G B」）取出實際色碼，
// 供 Monaco、xterm 這類無法使用 Tailwind class、只吃色碼字串的元件使用。
export const tokenHex = (name: string, fallback: string): string => {
  if (typeof document === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  const rgb = raw.split(/\s+/).map(Number);
  if (rgb.length !== 3 || rgb.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return fallback;
  return '#' + rgb.map((n) => n.toString(16).padStart(2, '0')).join('');
};
