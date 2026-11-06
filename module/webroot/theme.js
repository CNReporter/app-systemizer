// 主题色：从一颗种子色派生整套 M3 角色，写进行内 --md-*。
// 没有自定义色时清空行内变量，app.css 会回落到 --sys-*（系统动态取色）。
const PRESETS = [
  { name: '暮紫', color: '#6750A4' },
  { name: '海蓝', color: '#00639B' },
  { name: '青碧', color: '#006A6A' },
  { name: '苔绿', color: '#3B6939' },
  { name: '琥珀', color: '#7D5700' },
  { name: '朱红', color: '#B3261E' },
];

const ROLES = [
  'primary', 'on-primary', 'primary-container', 'on-primary-container',
  'secondary', 'on-secondary', 'secondary-container', 'on-secondary-container',
  'tertiary', 'on-tertiary', 'tertiary-container', 'on-tertiary-container',
  'error', 'on-error', 'error-container', 'on-error-container',
  'surface', 'on-surface', 'surface-variant', 'on-surface-variant',
  'surface-container-lowest', 'surface-container-low', 'surface-container',
  'surface-container-high', 'surface-container-highest',
  'outline', 'outline-variant',
  'inverse-surface', 'inverse-on-surface',
];

let scheme;
let activeSeed = null;

/** 接受 "6750A4"、"#6750A4"、"#6750a4"，返回规范化的 "#6750a4"，否则 null。 */
export function normalizeHex(value) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(value == null ? '' : value).trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}

function toRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 在深色底上返回白色，在浅色底上返回近黑色。 */
function onColor(hex) {
  return luminance(hex) > 0.5 ? '#121212' : '#ffffff';
}

function toHsl(hex) {
  const [r, g, b] = toRgb(hex).map((channel) => channel / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const hue = (value) => ((value % 360) + 360) % 360;
const tone = (h, s, l) => `hsl(${hue(h).toFixed(1)} ${(clamp(s, 0, 1) * 100).toFixed(1)}% ${(clamp(l, 0, 1) * 100).toFixed(1)}%)`;

/** 从种子色派生浅色或深色的一整套角色。 */
export function paletteFor(seed, dark) {
  const { h, s } = toHsl(seed);
  const warm = h + 60;
  const secondary = dark ? tone(h, s * 0.22, 0.80) : tone(h, s * 0.28, 0.42);
  const tertiary = dark ? tone(warm, s * 0.20, 0.82) : tone(warm, s * 0.30, 0.42);
  const primary = dark ? tone(h, Math.min(s, 0.72), 0.80) : seed;

  const palette = {
    primary,
    'on-primary': dark ? tone(h, 0.5, 0.16) : onColor(seed),
    'primary-container': dark ? tone(h, s * 0.72, 0.32) : tone(h, s * 0.90, 0.90),
    'on-primary-container': dark ? tone(h, s * 0.60, 0.90) : tone(h, Math.min(s, 0.85), 0.18),

    secondary,
    'on-secondary': dark ? tone(h, 0.2, 0.18) : onColor(secondary),
    'secondary-container': dark ? tone(h, s * 0.18, 0.28) : tone(h, s * 0.26, 0.92),
    'on-secondary-container': dark ? tone(h, s * 0.15, 0.90) : tone(h, s * 0.30, 0.20),

    tertiary,
    'on-tertiary': dark ? tone(warm, 0.2, 0.18) : onColor(tertiary),
    'tertiary-container': dark ? tone(warm, s * 0.22, 0.30) : tone(warm, s * 0.35, 0.92),
    'on-tertiary-container': dark ? tone(warm, s * 0.20, 0.90) : tone(warm, s * 0.35, 0.20),
  };

  if (dark) {
    Object.assign(palette, {
      error: '#F2B8B5', 'on-error': '#601410',
      'error-container': '#8C1D18', 'on-error-container': '#F9DEDC',
      surface: tone(h, 0.10, 0.07), 'on-surface': tone(h, 0.06, 0.92),
      'surface-variant': tone(h, 0.08, 0.30), 'on-surface-variant': tone(h, 0.06, 0.78),
      'surface-container-lowest': tone(h, 0.08, 0.05),
      'surface-container-low': tone(h, 0.08, 0.10),
      'surface-container': tone(h, 0.08, 0.13),
      'surface-container-high': tone(h, 0.08, 0.17),
      'surface-container-highest': tone(h, 0.08, 0.21),
      outline: tone(h, 0.05, 0.60), 'outline-variant': tone(h, 0.06, 0.30),
      'inverse-surface': tone(h, 0.05, 0.90), 'inverse-on-surface': tone(h, 0.06, 0.15),
    });
  } else {
    Object.assign(palette, {
      error: '#B3261E', 'on-error': '#FFFFFF',
      'error-container': '#F9DEDC', 'on-error-container': '#410E0B',
      surface: tone(h, Math.min(s, 0.4) * 0.5, 0.99), 'on-surface': tone(h, 0.12, 0.11),
      'surface-variant': tone(h, 0.10, 0.90), 'on-surface-variant': tone(h, 0.08, 0.33),
      'surface-container-lowest': '#FFFFFF',
      'surface-container-low': tone(h, 0.35, 0.975),
      'surface-container': tone(h, 0.33, 0.955),
      'surface-container-high': tone(h, 0.30, 0.93),
      'surface-container-highest': tone(h, 0.28, 0.905),
      outline: tone(h, 0.06, 0.50), 'outline-variant': tone(h, 0.09, 0.80),
      'inverse-surface': tone(h, 0.08, 0.20), 'inverse-on-surface': tone(h, 0.04, 0.95),
    });
  }

  return palette;
}

/** 应用（或清除）自定义色；seed 为 null 时回落到系统取色。 */
export function applyTheme(seed) {
  activeSeed = seed;
  const root = document.documentElement;
  if (!seed) {
    for (const role of ROLES) root.style.removeProperty(`--md-${role}`);
    delete root.dataset.customTheme;
    return;
  }
  const dark = Boolean(scheme && scheme.matches);
  const palette = paletteFor(seed, dark);
  for (const role of ROLES) root.style.setProperty(`--md-${role}`, palette[role]);
  root.dataset.customTheme = seed;
}

export function currentTheme() {
  return activeSeed;
}

export function readTheme(storageKey) {
  try {
    return normalizeHex(localStorage.getItem(storageKey));
  } catch (_) {
    return null;
  }
}

export function storeTheme(storageKey, seed) {
  try {
    if (seed) localStorage.setItem(storageKey, seed);
    else localStorage.removeItem(storageKey);
  } catch (_) { /* 隐私模式下忽略 */ }
}

export function initTheme(storageKey) {
  scheme = window.matchMedia('(prefers-color-scheme: dark)');
  scheme.addEventListener('change', () => {
    if (activeSeed) applyTheme(activeSeed);
  });
  const seed = readTheme(storageKey);
  applyTheme(seed);
  return seed;
}

export { PRESETS };
