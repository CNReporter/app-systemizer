// node_modules/kernelsu/index.js
var callbackCounter = 0;
function getUniqueCallbackName(prefix) {
  return `${prefix}_callback_${Date.now()}_${callbackCounter++}`;
}
function exec(command, options) {
  if (typeof options === "undefined") {
    options = {};
  }
  return new Promise((resolve, reject) => {
    const callbackFuncName = getUniqueCallbackName("exec");
    window[callbackFuncName] = (errno, stdout, stderr) => {
      resolve({ errno, stdout, stderr });
      cleanup(callbackFuncName);
    };
    function cleanup(successName) {
      delete window[successName];
    }
    try {
      ksu.exec(command, JSON.stringify(options), callbackFuncName);
    } catch (error) {
      reject(error);
      cleanup(callbackFuncName);
    }
  });
}
function Stdio() {
  this.listeners = {};
}
Stdio.prototype.on = function(event, listener) {
  if (!this.listeners[event]) {
    this.listeners[event] = [];
  }
  this.listeners[event].push(listener);
};
Stdio.prototype.emit = function(event, ...args) {
  if (this.listeners[event]) {
    this.listeners[event].forEach((listener) => listener(...args));
  }
};
function ChildProcess() {
  this.listeners = {};
  this.stdin = new Stdio();
  this.stdout = new Stdio();
  this.stderr = new Stdio();
}
ChildProcess.prototype.on = function(event, listener) {
  if (!this.listeners[event]) {
    this.listeners[event] = [];
  }
  this.listeners[event].push(listener);
};
ChildProcess.prototype.emit = function(event, ...args) {
  if (this.listeners[event]) {
    this.listeners[event].forEach((listener) => listener(...args));
  }
};
function toast(message) {
  ksu.toast(message);
}
function listPackages(type) {
  try {
    return JSON.parse(ksu.listPackages(type));
  } catch (error) {
    return [];
  }
}
function getPackagesInfo(packages) {
  try {
    if (typeof packages !== "string") {
      packages = JSON.stringify(packages);
    }
    return JSON.parse(ksu.getPackagesInfo(packages));
  } catch (error) {
    return [];
  }
}

// module/webroot/module-info.json
var module_info_default = {
  id: "app-systemizer",
  name: "App Systemizer",
  version: "1.6.2",
  versionCode: 1006002
};

// module/webroot/system-colors.js
var roles = {
  primary: "primary",
  onPrimary: "on_primary",
  primaryContainer: "primary_container",
  onPrimaryContainer: "on_primary_container",
  secondary: "secondary",
  onSecondary: "on_secondary",
  secondaryContainer: "secondary_container",
  onSecondaryContainer: "on_secondary_container",
  tertiary: "tertiary",
  onTertiary: "on_tertiary",
  tertiaryContainer: "tertiary_container",
  onTertiaryContainer: "on_tertiary_container",
  error: "error",
  onError: "on_error",
  errorContainer: "error_container",
  onErrorContainer: "on_error_container",
  background: "surface",
  surface: "surface",
  surfaceContainerLowest: "surface_container_lowest",
  surfaceContainerLow: "surface_container_low",
  surfaceContainer: "surface_container",
  surfaceContainerHigh: "surface_container_high",
  surfaceContainerHighest: "surface_container_highest",
  surfaceVariant: "surface_variant",
  onSurface: "on_surface",
  onSurfaceVariant: "on_surface_variant",
  outline: "outline",
  outlineVariant: "outline_variant",
  inverseSurface: "inverse_surface",
  inverseOnSurface: "inverse_on_surface"
};
var required = ["primary", "onPrimary", "primaryContainer", "onPrimaryContainer", "secondaryContainer", "onSecondaryContainer"];
var materialProperties = {
  "--sys-primary": "primary",
  "--sys-on-primary": "onPrimary",
  "--sys-primary-container": "primaryContainer",
  "--sys-on-primary-container": "onPrimaryContainer",
  "--sys-secondary": "secondary",
  "--sys-on-secondary": "onSecondary",
  "--sys-secondary-container": "secondaryContainer",
  "--sys-on-secondary-container": "onSecondaryContainer",
  "--sys-tertiary": "tertiary",
  "--sys-on-tertiary": "onTertiary",
  "--sys-tertiary-container": "tertiaryContainer",
  "--sys-on-tertiary-container": "onTertiaryContainer",
  "--sys-error": "error",
  "--sys-on-error": "onError",
  "--sys-error-container": "errorContainer",
  "--sys-on-error-container": "onErrorContainer",
  "--sys-surface": "surface",
  "--sys-on-surface": "onSurface",
  "--sys-surface-variant": "surfaceVariant",
  "--sys-on-surface-variant": "onSurfaceVariant",
  "--sys-surface-container-lowest": "surfaceContainerLowest",
  "--sys-surface-container-low": "surfaceContainerLow",
  "--sys-surface-container": "surfaceContainer",
  "--sys-surface-container-high": "surfaceContainerHigh",
  "--sys-surface-container-highest": "surfaceContainerHighest",
  "--sys-outline": "outline",
  "--sys-outline-variant": "outlineVariant",
  "--sys-inverse-surface": "inverseSurface",
  "--sys-inverse-on-surface": "inverseOnSurface"
};
var ownedProperties = Object.keys(materialProperties);
var palettes = /* @__PURE__ */ new Map();
var colorScheme;
var requestId = 0;
var refreshTimer;
function parseManagerColors(css) {
  const colors = {};
  for (const match of css.matchAll(/--([A-Za-z]+)\s*:\s*(#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?)\s*;/g)) {
    if (!Object.hasOwn(roles, match[1])) continue;
    if (match[2].length === 9 && !match[2].toLowerCase().endsWith("ff")) continue;
    colors[match[1]] = match[2].slice(0, 7).toLowerCase();
  }
  return colors;
}
function parseAndroidColors(output) {
  const colors = {};
  for (const line of output.split(/\r?\n/)) {
    const [role, ...parts] = line.split("=");
    if (!Object.hasOwn(roles, role)) continue;
    const match = parts.join("=").trim().match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
    if (!match) continue;
    const value = match[1].toLowerCase();
    if (value.length === 8 && !value.startsWith("ff")) continue;
    colors[role] = `#${value.length === 8 ? value.slice(2) : value}`;
  }
  return colors;
}
function usable(colors, dark) {
  if (!required.every((role) => colors[role])) return false;
  if (colors.background || colors.surface) {
    const value = colors.background || colors.surface;
    const rgb = [1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16));
    const brightness = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    if (brightness < 128 !== dark) return false;
  }
  return true;
}
async function managerColors(dark) {
  const abort = new AbortController();
  const timeout = window.setTimeout(() => abort.abort(), 1500);
  try {
    const response = await fetch("/internal/colors.css", { cache: "no-store", signal: abort.signal });
    if (!response.ok) return null;
    const colors = parseManagerColors(await response.text());
    return usable(colors, dark) ? colors : null;
  } catch (_) {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}
async function androidColors(dark) {
  const mode = dark ? "dark" : "light";
  const lookups = Object.entries(roles).filter(([role]) => role !== "background").map(([role, resource]) => `${role}:system_${resource}_${mode}`).join(" ");
  const command = `# app-systemizer:system-colors
user_id=$(/system/bin/am get-current-user 2>/dev/null)
case "$user_id" in ''|*[!0-9]*) exit 1 ;; esac
for item in ${lookups}; do
  key=\${item%%:*}
  resource=\${item#*:}
  value=$(/system/bin/cmd overlay lookup --user "$user_id" android "android:color/$resource" 2>/dev/null) || continue
  printf '%s=%s\\n' "$key" "$value"
done`;
  try {
    const result = await exec(command);
    if (result.errno !== 0) return null;
    const colors = parseAndroidColors(result.stdout || "");
    colors.background = colors.surface;
    return usable(colors, dark) ? colors : null;
  } catch (_) {
    return null;
  }
}
function applySystemColors() {
  const root = document.documentElement;
  for (const property of ownedProperties) root.style.removeProperty(property);
  delete root.dataset.systemColors;
  if (!colorScheme) return;
  const dark = colorScheme.matches;
  const palette = palettes.get(dark);
  if (!palette) return;
  for (const [property, role] of Object.entries(materialProperties)) {
    if (palette.colors[role]) root.style.setProperty(property, palette.colors[role]);
  }
  root.dataset.systemColors = palette.source;
}
async function refreshSystemColors() {
  const id = ++requestId;
  const dark = colorScheme.matches;
  let colors = await managerColors(dark);
  let source = "manager";
  if (id !== requestId) return;
  if (!colors) {
    colors = await androidColors(dark);
    source = "android";
  }
  if (id !== requestId || dark !== colorScheme.matches) return;
  if (colors) palettes.set(dark, { colors, source });
  applySystemColors();
}
function initSystemColors() {
  colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
  const schedule = () => {
    if (document.visibilityState === "hidden") return;
    ++requestId;
    applySystemColors();
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(refreshSystemColors, 150);
  };
  colorScheme.addEventListener("change", schedule);
  window.addEventListener("focus", schedule);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) schedule();
  });
  document.addEventListener("visibilitychange", schedule);
  void refreshSystemColors();
}

// module/webroot/theme.js
var PRESETS = [
  { name: "\u66AE\u7D2B", color: "#6750A4" },
  { name: "\u6D77\u84DD", color: "#00639B" },
  { name: "\u9752\u78A7", color: "#006A6A" },
  { name: "\u82D4\u7EFF", color: "#3B6939" },
  { name: "\u7425\u73C0", color: "#7D5700" },
  { name: "\u6731\u7EA2", color: "#B3261E" }
];
var ROLES = [
  "primary",
  "on-primary",
  "primary-container",
  "on-primary-container",
  "secondary",
  "on-secondary",
  "secondary-container",
  "on-secondary-container",
  "tertiary",
  "on-tertiary",
  "tertiary-container",
  "on-tertiary-container",
  "error",
  "on-error",
  "error-container",
  "on-error-container",
  "surface",
  "on-surface",
  "surface-variant",
  "on-surface-variant",
  "surface-container-lowest",
  "surface-container-low",
  "surface-container",
  "surface-container-high",
  "surface-container-highest",
  "outline",
  "outline-variant",
  "inverse-surface",
  "inverse-on-surface"
];
var scheme;
var activeSeed = null;
var forcedMode = "system";
function isDark() {
  if (forcedMode === "dark") return true;
  if (forcedMode === "light") return false;
  return Boolean(scheme && scheme.matches);
}
function setForcedMode(mode) {
  forcedMode = mode === "light" || mode === "dark" ? mode : "system";
}
function normalizeHex(value) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(value == null ? "" : value).trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}
function toRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [value >> 16 & 255, value >> 8 & 255, value & 255];
}
function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function onColor(hex) {
  return luminance(hex) > 0.5 ? "#121212" : "#ffffff";
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
var clamp = (value, min, max) => Math.min(max, Math.max(min, value));
var hue = (value) => (value % 360 + 360) % 360;
var tone = (h, s, l) => `hsl(${hue(h).toFixed(1)} ${(clamp(s, 0, 1) * 100).toFixed(1)}% ${(clamp(l, 0, 1) * 100).toFixed(1)}%)`;
function paletteFor(seed, dark) {
  const { h, s } = toHsl(seed);
  const warm = h + 60;
  const secondary = dark ? tone(h, s * 0.22, 0.8) : tone(h, s * 0.28, 0.42);
  const tertiary = dark ? tone(warm, s * 0.2, 0.82) : tone(warm, s * 0.3, 0.42);
  const primary = dark ? tone(h, Math.min(s, 0.72), 0.8) : seed;
  const palette = {
    primary,
    "on-primary": dark ? tone(h, 0.5, 0.16) : onColor(seed),
    "primary-container": dark ? tone(h, s * 0.72, 0.32) : tone(h, s * 0.9, 0.9),
    "on-primary-container": dark ? tone(h, s * 0.6, 0.9) : tone(h, Math.min(s, 0.85), 0.18),
    secondary,
    "on-secondary": dark ? tone(h, 0.2, 0.18) : onColor(secondary),
    "secondary-container": dark ? tone(h, s * 0.18, 0.28) : tone(h, s * 0.26, 0.92),
    "on-secondary-container": dark ? tone(h, s * 0.15, 0.9) : tone(h, s * 0.3, 0.2),
    tertiary,
    "on-tertiary": dark ? tone(warm, 0.2, 0.18) : onColor(tertiary),
    "tertiary-container": dark ? tone(warm, s * 0.22, 0.3) : tone(warm, s * 0.35, 0.92),
    "on-tertiary-container": dark ? tone(warm, s * 0.2, 0.9) : tone(warm, s * 0.35, 0.2)
  };
  if (dark) {
    Object.assign(palette, {
      error: "#F2B8B5",
      "on-error": "#601410",
      "error-container": "#8C1D18",
      "on-error-container": "#F9DEDC",
      surface: tone(h, 0.1, 0.07),
      "on-surface": tone(h, 0.06, 0.92),
      "surface-variant": tone(h, 0.08, 0.3),
      "on-surface-variant": tone(h, 0.06, 0.78),
      "surface-container-lowest": tone(h, 0.08, 0.05),
      "surface-container-low": tone(h, 0.08, 0.1),
      "surface-container": tone(h, 0.08, 0.13),
      "surface-container-high": tone(h, 0.08, 0.17),
      "surface-container-highest": tone(h, 0.08, 0.21),
      outline: tone(h, 0.05, 0.6),
      "outline-variant": tone(h, 0.06, 0.3),
      "inverse-surface": tone(h, 0.05, 0.9),
      "inverse-on-surface": tone(h, 0.06, 0.15)
    });
  } else {
    Object.assign(palette, {
      error: "#B3261E",
      "on-error": "#FFFFFF",
      "error-container": "#F9DEDC",
      "on-error-container": "#410E0B",
      surface: tone(h, Math.min(s, 0.4) * 0.5, 0.99),
      "on-surface": tone(h, 0.12, 0.11),
      "surface-variant": tone(h, 0.1, 0.9),
      "on-surface-variant": tone(h, 0.08, 0.33),
      "surface-container-lowest": "#FFFFFF",
      "surface-container-low": tone(h, 0.35, 0.975),
      "surface-container": tone(h, 0.33, 0.955),
      "surface-container-high": tone(h, 0.3, 0.93),
      "surface-container-highest": tone(h, 0.28, 0.905),
      outline: tone(h, 0.06, 0.5),
      "outline-variant": tone(h, 0.09, 0.8),
      "inverse-surface": tone(h, 0.08, 0.2),
      "inverse-on-surface": tone(h, 0.04, 0.95)
    });
  }
  return palette;
}
function applyTheme(seed) {
  activeSeed = seed;
  const root = document.documentElement;
  if (!seed) {
    for (const role of ROLES) root.style.removeProperty(`--md-${role}`);
    delete root.dataset.customTheme;
    return;
  }
  const palette = paletteFor(seed, isDark());
  for (const role of ROLES) root.style.setProperty(`--md-${role}`, palette[role]);
  root.dataset.customTheme = seed;
}
function readTheme(storageKey) {
  try {
    return normalizeHex(localStorage.getItem(storageKey));
  } catch (_) {
    return null;
  }
}
function storeTheme(storageKey, seed) {
  try {
    if (seed) localStorage.setItem(storageKey, seed);
    else localStorage.removeItem(storageKey);
  } catch (_) {
  }
}
function initTheme(storageKey) {
  scheme = window.matchMedia("(prefers-color-scheme: dark)");
  scheme.addEventListener("change", () => {
    if (activeSeed) applyTheme(activeSeed);
  });
  const seed = readTheme(storageKey);
  applyTheme(seed);
  return seed;
}

// module/webroot/app.js
var CONTROL = `/data/adb/modules/${module_info_default.id}/scripts/app-systemizer.sh`;
var THEME_KEY = `${module_info_default.id}-theme`;
var THEME_MODE_KEY = `${module_info_default.id}-theme-mode`;
var MODE_LABELS = { system: "\u8DDF\u968F\u7CFB\u7EDF", light: "\u4EAE\u8272", dark: "\u6697\u8272" };
var state = {
  apps: [],
  selected: /* @__PURE__ */ new Map(),
  saved: /* @__PURE__ */ new Map(),
  filter: "",
  logFilter: "all",
  themeMode: "system",
  logs: [],
  logEnabled: false,
  pendingReboot: false,
  refreshing: false,
  defaultTarget: "app"
};
var $ = (selector) => document.querySelector(selector);
var list = $("#app-list");
var save = $("#save");
var count = $("#count");
function log(kind, text) {
  if (!state.logEnabled) return;
  const normalized = String(text == null ? "" : text).trim();
  state.logs.push({ time: /* @__PURE__ */ new Date(), kind, text: normalized || "(\u7A7A\u8F93\u51FA)" });
  if (state.logs.length > 300) state.logs.splice(0, state.logs.length - 300);
  if (!$("#panel-logs").hidden) renderLogs();
}
function renderLogs() {
  const entries = state.logEnabled ? state.logs : [];
  const counts = { ok: 0, info: 0, warn: 0, err: 0 };
  for (const entry of entries) counts[entry.kind] = (counts[entry.kind] || 0) + 1;
  $("#log-count-ok").textContent = `${counts.ok} OK`;
  $("#log-count-info").textContent = `${counts.info} \u4FE1\u606F`;
  $("#log-count-warn").textContent = `${counts.warn} \u8B66\u544A`;
  $("#log-count-err").textContent = `${counts.err} \u9519\u8BEF`;
  $("#log-hero-title").textContent = `\u4ECA\u5929 \xB7 ${entries.length} \u6761\u8BB0\u5F55`;
  $("#log-hero-meta").textContent = entries.length ? `${entries[0].time.toLocaleTimeString("zh-CN", { hour12: false })} \u2013 ${entries[entries.length - 1].time.toLocaleTimeString("zh-CN", { hour12: false })} \xB7 \u81EA\u52A8\u8BB0\u5F55\u547D\u4EE4\u8F93\u51FA` : state.logEnabled ? "\u8FD8\u6CA1\u6709\u8BB0\u5F55\u4EFB\u4F55\u547D\u4EE4\u8F93\u51FA" : "\u65E5\u5FD7\u5DF2\u5173\u95ED\uFF0C\u4E0D\u8BB0\u5F55\u4EFB\u4F55\u8F93\u51FA";
  for (const button of document.querySelectorAll("[data-log-filter]")) {
    const active = button.dataset.logFilter === state.logFilter;
    button.classList.toggle("is-on", active);
    button.setAttribute("aria-pressed", String(active));
  }
  const box = $("#log-list");
  box.replaceChildren();
  const visible = entries.filter((entry) => state.logFilter === "all" || entry.kind === state.logFilter);
  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "log-empty";
    empty.textContent = entries.length ? "\u8FD9\u4E2A\u7B5B\u9009\u4E0B\u6CA1\u6709\u8BB0\u5F55\u3002" : state.logEnabled ? "\u6682\u65E0\u65E5\u5FD7\u3002\u6267\u884C\u4E00\u6B21\u4FDD\u5B58\u6216\u5237\u65B0\u5373\u53EF\u770B\u5230\u3002" : "\u65E5\u5FD7\u5DF2\u5173\u95ED\uFF0C\u4E0D\u8BB0\u5F55\u4EFB\u4F55\u8F93\u51FA\u3002";
    box.append(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const entry of [...visible].reverse()) {
    const line = document.createElement("div");
    line.className = "log";
    const top = document.createElement("div");
    top.className = "log__top";
    const time = document.createElement("span");
    time.className = "log__time";
    time.textContent = entry.time.toLocaleTimeString("zh-CN", { hour12: false });
    const tag = document.createElement("span");
    tag.className = `tag ${entry.kind}`;
    tag.textContent = entry.kind === "ok" ? "OK" : entry.kind === "err" ? "\u9519\u8BEF" : entry.kind === "warn" ? "\u8B66\u544A" : "\u4FE1\u606F";
    top.append(time, tag);
    const text = document.createElement("p");
    text.className = "log__text";
    text.textContent = entry.text;
    line.append(top, text);
    fragment.append(line);
  }
  box.append(fragment);
}
function readStorage(key, fallback) {
  try {
    let value = localStorage.getItem(key);
    const legacyKey = { "app-systemizer-log-enabled": "sap-log-enabled" }[key];
    if (value == null && legacyKey) {
      value = localStorage.getItem(legacyKey);
      if (value != null) {
        localStorage.setItem(key, value);
        localStorage.removeItem(legacyKey);
      }
    }
    return value == null ? fallback : value;
  } catch (_) {
    return fallback;
  }
}
function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (_) {
  }
}
function syncLogTab() {
  const tab = document.querySelector('.nav-tab[data-tab="logs"]');
  if (!tab) return;
  tab.hidden = !state.logEnabled;
  if (!state.logEnabled && activeTab() === "logs") switchTab("apps");
}
function initSettings() {
  state.logEnabled = readStorage(`${module_info_default.id}-log-enabled`, "0") === "1";
  const logSwitch = $("#log-enabled");
  logSwitch.checked = state.logEnabled;
  syncLogTab();
  logSwitch.addEventListener("change", () => {
    if (logSwitch.checked) {
      state.logEnabled = true;
      writeStorage(`${module_info_default.id}-log-enabled`, "1");
      log("info", "\u5DF2\u5F00\u542F\u663E\u793A\u65E5\u5FD7\uFF0C\u540E\u7EED\u547D\u4EE4\u8F93\u51FA\u5C06\u8BB0\u5F55\u5728\u65E5\u5FD7\u9875\u3002");
    } else {
      log("info", "\u5DF2\u5173\u95ED\u663E\u793A\u65E5\u5FD7\uFF0C\u4E0D\u518D\u8BB0\u5F55\u65B0\u7684\u8F93\u51FA\u3002");
      state.logEnabled = false;
      writeStorage(`${module_info_default.id}-log-enabled`, "0");
    }
    syncLogTab();
    renderLogs();
  });
}
var currentSeed = null;
var pendingSeed = null;
var themeCommitting = false;
function paintThemeRow() {
  $("#theme-value").textContent = currentSeed ? currentSeed.toUpperCase() : "\u7CFB\u7EDF\u53D6\u8272";
}
function setThemeMode(mode, { persist = true } = {}) {
  const next = MODE_LABELS[mode] ? mode : "system";
  state.themeMode = next;
  const root = document.documentElement;
  if (next === "system") delete root.dataset.theme;
  else root.dataset.theme = next;
  setForcedMode(next);
  if (persist) writeStorage(THEME_MODE_KEY, next);
  const label = $("#theme-mode-value");
  if (label) label.textContent = MODE_LABELS[next];
  for (const item of document.querySelectorAll("[data-mode]")) {
    item.setAttribute("aria-selected", String(item.dataset.mode === next));
  }
  if (currentSeed) applyTheme(currentSeed);
}
function syncSwatches() {
  for (const button of document.querySelectorAll("[data-preset]")) {
    button.setAttribute("aria-pressed", String(pendingSeed === button.dataset.preset));
  }
}
function previewSeed(seed) {
  pendingSeed = seed;
  applyTheme(seed);
  syncSwatches();
  $("#theme-apply").disabled = !seed;
}
function openTheme() {
  pendingSeed = currentSeed;
  $("#theme-hex").value = currentSeed ? currentSeed.slice(1).toUpperCase() : "";
  previewSeed(currentSeed);
  $("#theme-dialog").showModal();
}
function initThemeSheet() {
  setThemeMode(readStorage(THEME_MODE_KEY, "system"), { persist: false });
  currentSeed = initTheme(THEME_KEY);
  paintThemeRow();
  const swatches = $("#theme-swatches");
  for (const preset of PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "color";
    button.dataset.preset = preset.color;
    button.style.setProperty("--c", preset.color);
    button.setAttribute("aria-label", preset.name);
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
    button.addEventListener("click", () => {
      $("#theme-hex").value = preset.color.slice(1).toUpperCase();
      previewSeed(preset.color);
    });
    swatches.append(button);
  }
  const input = $("#theme-hex");
  input.addEventListener("input", () => {
    const raw = input.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6).toUpperCase();
    if (raw !== input.value) input.value = raw;
    const hex = raw.length === 6 ? normalizeHex(raw) : null;
    if (hex) {
      previewSeed(hex);
    } else {
      pendingSeed = null;
      applyTheme(currentSeed);
      syncSwatches();
      $("#theme-apply").disabled = true;
    }
  });
  $("#theme-clear").addEventListener("click", () => {
    input.value = "";
    input.focus();
    pendingSeed = null;
    applyTheme(currentSeed);
    syncSwatches();
    $("#theme-apply").disabled = true;
  });
  $("#theme-row").addEventListener("click", openTheme);
  $("#theme-close").addEventListener("click", () => $("#theme-dialog").close());
  $("#theme-apply").addEventListener("click", () => {
    if (!pendingSeed) return;
    themeCommitting = true;
    currentSeed = pendingSeed;
    storeTheme(THEME_KEY, currentSeed);
    $("#theme-dialog").close();
  });
  $("#theme-system").addEventListener("click", () => {
    themeCommitting = true;
    currentSeed = null;
    pendingSeed = null;
    storeTheme(THEME_KEY, null);
    applyTheme(null);
    $("#theme-dialog").close();
  });
  $("#theme-dialog").addEventListener("close", () => {
    if (!themeCommitting) applyTheme(currentSeed);
    themeCommitting = false;
    pendingSeed = currentSeed;
    paintThemeRow();
  });
  $("#theme-dialog").addEventListener("click", (event) => {
    if (event.target === $("#theme-dialog")) $("#theme-dialog").close();
  });
  const modeTrigger = $("#theme-mode-row");
  const modeMenu = $("#theme-mode-menu");
  const modeOptions = [...modeMenu.querySelectorAll("[data-mode]")];
  const closeModeMenu = ({ refocus = false } = {}) => {
    if (modeMenu.hidden) return;
    modeMenu.hidden = true;
    modeTrigger.setAttribute("aria-expanded", "false");
    if (refocus) modeTrigger.focus({ preventScroll: true });
  };
  modeTrigger.addEventListener("click", () => {
    if (!modeMenu.hidden) {
      closeModeMenu();
      return;
    }
    modeMenu.hidden = false;
    modeTrigger.setAttribute("aria-expanded", "true");
    const current = modeOptions.find((item) => item.dataset.mode === state.themeMode) || modeOptions[0];
    current.focus({ preventScroll: true });
  });
  for (const option of modeOptions) {
    option.addEventListener("click", () => {
      setThemeMode(option.dataset.mode);
      closeModeMenu({ refocus: true });
    });
  }
  modeMenu.addEventListener("keydown", (event) => {
    const index = modeOptions.indexOf(document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      modeOptions[(index + step + modeOptions.length) % modeOptions.length].focus({ preventScroll: true });
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (index >= 0) modeOptions[index].click();
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeModeMenu({ refocus: true });
    }
  });
  document.addEventListener("click", (event) => {
    if (modeMenu.hidden) return;
    if (event.target.closest("#theme-mode-row, #theme-mode-menu")) return;
    closeModeMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModeMenu();
  });
}
var TAB_TITLES = { apps: "\u7CFB\u7EDF\u5E94\u7528\u8F6C\u6362", logs: "\u8FD0\u884C\u65E5\u5FD7", settings: "\u8BBE\u7F6E" };
function switchTab(name) {
  document.body.dataset.tab = name;
  $(".top-bar__title").textContent = TAB_TITLES[name] || TAB_TITLES.apps;
  document.querySelectorAll(".nav-tab").forEach((button) => {
    const active = button.dataset.tab === name;
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== name;
  });
  if (name === "logs") renderLogs();
  window.scrollTo(0, 0);
  $(".top-bar").dataset.scrolled = "false";
}
var PULL_THRESHOLD = 40;
var PULL_MAX = 72;
var PULL_RESISTANCE = 0.6;
var PULL_MAX_BOUNCE = 44;
function activeTab() {
  return document.body.dataset.tab || "apps";
}
async function refreshAll() {
  if (state.refreshing) return;
  const tab = activeTab();
  if (tab === "settings") return;
  state.refreshing = true;
  try {
    if (tab === "logs") {
      renderLogs();
      return;
    }
    const keepSelection = hasUnsavedChanges();
    log("info", keepSelection ? "\u4E0B\u62C9\u5237\u65B0\uFF1A\u91CD\u65B0\u8BFB\u53D6\u5E94\u7528\u5217\u8868\u4E0E\u6302\u8F7D\u72B6\u6001\uFF08\u4FDD\u7559\u672A\u4FDD\u5B58\u7684\u4FEE\u6539\uFF09\u3002" : "\u4E0B\u62C9\u5237\u65B0\uFF1A\u91CD\u65B0\u8BFB\u53D6\u5E94\u7528\u5217\u8868\u4E0E\u6302\u8F7D\u72B6\u6001\u3002");
    await loadApps({ preserveSelection: keepSelection });
    if (keepSelection) toast("\u5DF2\u5237\u65B0\u3002\u672A\u4FDD\u5B58\u7684\u4FEE\u6539\u5DF2\u4FDD\u7559");
  } catch (error) {
    log("err", `\u5237\u65B0\u5931\u8D25\uFF1A${error.message || error}`);
  } finally {
    state.refreshing = false;
  }
}
function initTopBar() {
  const bar = $(".top-bar");
  const COLLAPSE_AT = 8;
  let ticking = false;
  const paint = () => {
    ticking = false;
    bar.dataset.scrolled = window.scrollY > COLLAPSE_AT ? "true" : "false";
  };
  const schedule = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(paint);
  };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  paint();
}
function initPullGesture() {
  const page = $("#page");
  const indicator = $("#pull-indicator");
  const indicatorText = $("#pull-text");
  let startX = 0;
  let startY = 0;
  let pullDirection = null;
  let allowDown = false;
  let allowUp = false;
  let pulling = false;
  let offset = 0;
  let busy = false;
  let settleTimer;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const setTransform = (value) => {
    page.style.transform = value === 0 ? "none" : `translate3d(0, ${value}px, 0)`;
  };
  const animateTo = (value, duration) => {
    window.clearTimeout(settleTimer);
    const time = reducedMotion.matches ? 0 : duration;
    page.style.transition = time ? `transform ${time}ms cubic-bezier(.2, .8, .2, 1)` : "";
    setTransform(value);
    if (time) settleTimer = window.setTimeout(() => {
      page.style.transition = "";
    }, time + 20);
  };
  const paintIndicator = () => {
    if (busy) return;
    if (activeTab() === "settings" || pullDirection !== "down") {
      indicator.style.opacity = "0";
      indicatorText.textContent = "";
      return;
    }
    indicator.style.opacity = String(Math.min(1, offset / PULL_THRESHOLD));
    indicatorText.textContent = offset >= PULL_THRESHOLD ? "\u677E\u624B\u5237\u65B0" : "\u4E0B\u62C9\u5237\u65B0";
  };
  const settle = () => animateTo(0, 240);
  document.addEventListener("touchstart", (event) => {
    allowDown = false;
    allowUp = false;
    if (busy || event.touches.length !== 1) return;
    if (event.target.closest("dialog, button, input, .bottom-nav")) return;
    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    pullDirection = null;
    pulling = false;
    offset = 0;
    allowDown = window.scrollY <= 0;
    allowUp = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1;
  }, { passive: true });
  document.addEventListener("touchmove", (event) => {
    if (busy || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (!pulling) {
      if (Math.abs(deltaY) < 10) return;
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        allowDown = false;
        allowUp = false;
        return;
      }
      const goingDown = deltaY > 0;
      if (goingDown ? !allowDown : !allowUp) {
        allowDown = false;
        allowUp = false;
        return;
      }
      pulling = true;
      pullDirection = goingDown ? "down" : "up";
      window.clearTimeout(settleTimer);
      page.style.transition = "";
    }
    event.preventDefault();
    const cap = activeTab() === "settings" ? PULL_MAX_BOUNCE : PULL_MAX;
    offset = cap * (1 - Math.exp(-Math.abs(deltaY) * PULL_RESISTANCE / cap));
    setTransform(pullDirection === "down" ? offset : -offset);
    paintIndicator();
  }, { passive: false });
  const release = async () => {
    if (!pulling) {
      pullDirection = null;
      return;
    }
    const canRefresh = activeTab() !== "settings";
    const shouldRefresh = canRefresh && pullDirection === "down" && offset >= PULL_THRESHOLD;
    pulling = false;
    pullDirection = null;
    if (!shouldRefresh) {
      offset = 0;
      settle();
      indicator.style.opacity = "0";
      return;
    }
    busy = true;
    offset = PULL_THRESHOLD;
    indicator.dataset.spin = "true";
    indicatorText.textContent = "\u6B63\u5728\u5237\u65B0\u2026";
    animateTo(PULL_THRESHOLD, 160);
    try {
      await refreshAll();
    } finally {
      delete indicator.dataset.spin;
      busy = false;
      offset = 0;
      settle();
      indicator.style.opacity = "0";
      indicatorText.textContent = "\u4E0B\u62C9\u5237\u65B0";
    }
  };
  document.addEventListener("touchend", release);
  document.addEventListener("touchcancel", () => {
    pulling = false;
    pullDirection = null;
    offset = 0;
    if (!busy) {
      settle();
      indicator.style.opacity = "0";
    }
  });
}
function encodeBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function selectionLines() {
  const labels = new Map(state.apps.map((app) => [app.packageName, app.appLabel || "\u672A\u547D\u540D\u5E94\u7528"]));
  const lines = [...state.selected.entries()].reverse().map(([pkg, target]) => `${pkg}|${target}|${encodeBase64(labels.get(pkg) || "\u672A\u547D\u540D\u5E94\u7528")}`).join("\n");
  return lines ? `${lines}
` : "\n";
}
function targetLabel(target) {
  return target === "priv-app" ? "/system/priv-app" : "/system/app";
}
function initTargetSelect() {
  const trigger = $("#target-select");
  const menu = $("#target-menu");
  const value = $("#target-value");
  const options = [...menu.querySelectorAll("[data-target-option]")];
  const close = ({ refocus = false } = {}) => {
    if (menu.hidden) return;
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (refocus) trigger.focus({ preventScroll: true });
  };
  const open = () => {
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    const current = options.find((item) => item.dataset.targetOption === state.defaultTarget) || options[0];
    current.focus({ preventScroll: true });
  };
  const choose = (option) => {
    const next = option.dataset.targetOption;
    const changed = state.defaultTarget !== next;
    state.defaultTarget = next;
    value.textContent = targetLabel(next);
    for (const item of options) {
      item.setAttribute("aria-selected", String(item === option));
    }
    close({ refocus: true });
    if (changed) log("info", `\u76EE\u6807\u76EE\u5F55\u5207\u6362\u4E3A ${targetLabel(next)}`);
  };
  trigger.addEventListener("click", () => menu.hidden ? open() : close());
  for (const option of options) {
    option.addEventListener("click", () => choose(option));
  }
  menu.addEventListener("keydown", (event) => {
    const index = options.indexOf(document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      options[(index + step + options.length) % options.length].focus({ preventScroll: true });
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (index >= 0) choose(options[index]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close({ refocus: true });
    }
  });
  document.addEventListener("click", (event) => {
    if (menu.hidden) return;
    if (event.target.closest("#target-select, #target-menu")) return;
    close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close({ refocus: true });
  });
}
function hasUnsavedChanges() {
  if (state.selected.size !== state.saved.size) return true;
  return [...state.selected].some(([pkg, target]) => state.saved.get(pkg) !== target);
}
function refreshSummary() {
  const size = state.selected.size;
  const changed = hasUnsavedChanges();
  const summary = $("#selection-summary");
  if (!size) {
    summary.textContent = "\u672A\u9009\u62E9\u5E94\u7528";
  } else if (changed) {
    summary.textContent = `\u5DF2\u9009 ${size} \u4E2A \xB7 \u4FEE\u6539\u672A\u4FDD\u5B58`;
  } else if (state.pendingReboot) {
    summary.textContent = `\u5DF2\u9009 ${size} \u4E2A \xB7 \u7B49\u5F85\u91CD\u542F`;
  } else {
    summary.textContent = `\u5DF2\u9009 ${size} \u4E2A \xB7 \u5DF2\u751F\u6548`;
  }
  summary.dataset.state = changed ? "dirty" : "clean";
  save.hidden = !changed;
  save.disabled = !changed;
  $("#save-label").textContent = size ? `\u4FDD\u5B58 ${size} \u9879` : "\u4FDD\u5B58\u66F4\u6539";
  const clearButton = $("#clear-selection");
  if (clearButton) clearButton.disabled = size === 0;
}
async function updateMountStatus() {
  const card = $("#status-card");
  const setState = (stateName, title, chip, apps, hero, summary) => {
    if (card) card.dataset.state = stateName;
    $("#status-label").textContent = title;
    $("#status-chip").textContent = chip;
    $("#status-apps").textContent = String(apps);
    $("#status-hero").textContent = hero;
    $("#mount-status").textContent = summary;
  };
  try {
    const result = await exec(`${CONTROL} status`);
    const output = result.stdout || "";
    const metamoduleActive = /METAMODULE=active/.test(output);
    const metamoduleId = (output.match(/METAMODULE_ID=(.+)/) || [, ""])[1].trim();
    const systemMountActive = /SYSTEM_MOUNT=active/.test(output);
    const apps = Number((output.match(/MOUNTED_APPS=(\d+)/) || [, 0])[1]);
    const apks = Number((output.match(/STAGED_APKS=(\d+)/) || [, 0])[1]);
    const pending = /PENDING_REBOOT=1/.test(output);
    state.pendingReboot = pending;
    const metamodule = $("#info-metamodule");
    if (metamodule) metamodule.textContent = metamoduleId || (metamoduleActive ? "Magic Mount-rs" : "\u672A\u68C0\u6D4B\u5230");
    if (!metamoduleActive) {
      setState("err", "\u672A\u68C0\u6D4B\u5230\u6302\u8F7D\u5143\u6A21\u5757", "\u9700\u914D\u7F6E", 0, "\u4E2A\u5E94\u7528\u5DF2\u6258\u7BA1", "\u8BF7\u5148\u5B89\u88C5\u5E76\u542F\u7528 Magic Mount-rs");
    } else if (pending) {
      setState("pending", "\u914D\u7F6E\u5DF2\u4FDD\u5B58\uFF0C\u7B49\u5F85\u91CD\u542F", "\u5F85\u91CD\u542F", apps, "\u4E2A\u5E94\u7528\u5F85\u751F\u6548", `\u5DF2\u6682\u5B58 ${apks} \u4E2A APK \u6587\u4EF6`);
    } else if (!apps) {
      setState("ok", "\u5F53\u524D\u6CA1\u6709\u914D\u7F6E\u4EFB\u4F55\u5E94\u7528", "\u7A7A", 0, "\u4E2A\u5E94\u7528\u5DF2\u6258\u7BA1", "\u52FE\u9009\u5E94\u7528\u5E76\u4FDD\u5B58\uFF0C\u91CD\u542F\u540E\u751F\u6548");
    } else if (!systemMountActive) {
      const other = metamoduleId && !/magic/i.test(metamoduleId);
      setState(
        "warn",
        other ? "\u5143\u6A21\u5757\u4E0D\u652F\u6301\u7ED1\u5B9A\u6302\u8F7D" : "\u5DF2\u542F\u7528 Magic Mount-rs",
        other ? "\u672A\u6302\u8F7D" : "\u5F85\u6302\u8F7D",
        apps,
        "\u4E2A\u5E94\u7528\u5F85\u6302\u8F7D",
        `\u5DF2\u6682\u5B58 ${apks} \u4E2A APK \u6587\u4EF6`
      );
    } else {
      setState("ok", "\u6302\u8F7D\u5DF2\u751F\u6548", "\u5DF2\u751F\u6548", apps, "\u4E2A\u5E94\u7528\u5DF2\u6258\u7BA1", `\u5171 ${apks} \u4E2A APK \u6587\u4EF6 \xB7 \u5F00\u673A\u81EA\u52A8\u6302\u8F7D`);
    }
    log(result.errno === 0 ? "ok" : "warn", `\u6302\u8F7D\u68C0\u67E5\uFF1A${output.trim() || "(\u7A7A\u8F93\u51FA)"}`);
  } catch (error) {
    setState("err", "\u65E0\u6CD5\u8BFB\u53D6\u6302\u8F7D\u72B6\u6001", "\u9519\u8BEF", 0, "\u4E2A\u5E94\u7528\u5DF2\u6258\u7BA1", "\u8BF7\u4ECE KernelSU \u7BA1\u7406\u5668\u5185\u6253\u5F00\u6B64\u9875\u9762");
    log("err", `\u6302\u8F7D\u68C0\u67E5\u5931\u8D25\uFF1A${error.message || error}`);
  }
  refreshSummary();
}
function visibleApps() {
  const term = state.filter.trim().toLocaleLowerCase();
  return state.apps.filter((app) => !term || `${app.appLabel} ${app.packageName}`.toLocaleLowerCase().includes(term));
}
function render() {
  const apps = visibleApps();
  count.textContent = String(apps.length);
  count.title = `\u663E\u793A ${apps.length} / ${state.apps.length} \u4E2A\u5E94\u7528`;
  list.replaceChildren();
  if (!apps.length) {
    list.innerHTML = '<p class="empty">\u6CA1\u6709\u5339\u914D\u7684\u5E94\u7528</p>';
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const app of apps) {
    const selectedTarget = state.selected.get(app.packageName);
    const locked = app.isSystem && !state.saved.has(app.packageName);
    const row = document.createElement("div");
    row.className = `row${selectedTarget ? " is-selected" : ""}${locked ? " is-locked" : ""}`;
    row.setAttribute("role", "checkbox");
    row.setAttribute("aria-checked", String(Boolean(selectedTarget)));
    if (locked) row.setAttribute("aria-disabled", "true");
    row.setAttribute("tabindex", "0");
    const toggle = () => {
      const nowSelected = state.selected.has(app.packageName);
      if (!nowSelected && locked) return;
      if (nowSelected) state.selected.delete(app.packageName);
      else state.selected.set(app.packageName, state.defaultTarget);
      refreshSummary();
      render();
    };
    row.addEventListener("click", (event) => {
      if (event.target.closest("button, a, input, select, img")) return;
      toggle();
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggle();
      }
    });
    const icon = document.createElement("img");
    icon.className = "row__icon";
    icon.alt = "";
    icon.src = `ksu://icon/${app.packageName}`;
    icon.onerror = () => {
      icon.style.visibility = "hidden";
    };
    const text = document.createElement("div");
    text.className = "row__text";
    const name = document.createElement("span");
    name.className = "row__title";
    name.textContent = app.appLabel || app.packageName;
    if (locked) {
      const tag = document.createElement("span");
      tag.className = "row__tag";
      tag.textContent = "\u5DF2\u662F\u7CFB\u7EDF\u5E94\u7528";
      name.append(tag);
    }
    const pkg = document.createElement("span");
    pkg.className = "row__sub";
    pkg.textContent = selectedTarget ? `${app.packageName} \xB7 ${targetLabel(selectedTarget)}` : app.packageName;
    text.append(name, pkg);
    const check = document.createElement("span");
    check.className = `checkbox${selectedTarget ? " is-on" : ""}`;
    check.setAttribute("aria-hidden", "true");
    check.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
    row.append(icon, text, check);
    fragment.append(row);
  }
  list.append(fragment);
}
async function loadSavedSelection() {
  const result = await exec(`${CONTROL} export`);
  if (result.errno !== 0 || !result.stdout.trim()) {
    if (result.errno !== 0) log("warn", `\u8BFB\u53D6\u5DF2\u4FDD\u5B58\u9009\u62E9\u5931\u8D25\uFF1A${result.stderr || result.stdout || "\u672A\u77E5\u9519\u8BEF"}`);
    return;
  }
  state.selected.clear();
  state.saved.clear();
  const savedLines = [];
  for (const line of result.stdout.trim().split(/\r?\n/)) {
    const [pkg, target] = line.split("|");
    if (/^[A-Za-z0-9._]+$/.test(pkg) && ["app", "priv-app"].includes(target)) savedLines.push([pkg, target]);
  }
  state.selected = new Map(savedLines.reverse());
  state.saved = new Map(state.selected);
}
async function loadApps({ preserveSelection = false } = {}) {
  list.innerHTML = '<p class="empty">\u6B63\u5728\u4ECE Package Manager \u8BFB\u53D6\u5E94\u7528\u2026</p>';
  try {
    await updateMountStatus();
    if (!preserveSelection) await loadSavedSelection();
    const names = listPackages("all");
    const details = [];
    for (let i = 0; i < names.length; i += 80) details.push(...getPackagesInfo(names.slice(i, i + 80)));
    const managedOrder = new Map([...state.selected.keys()].reverse().map((pkg, index) => [pkg, index]));
    state.apps = details.filter((app) => !app.isSystem || managedOrder.has(app.packageName)).sort((a, b) => {
      const aOrder = managedOrder.get(a.packageName);
      const bOrder = managedOrder.get(b.packageName);
      const aManaged = aOrder !== void 0;
      const bManaged = bOrder !== void 0;
      if (aManaged !== bManaged) return aManaged ? -1 : 1;
      if (aManaged && bManaged) return aOrder - bOrder;
      return (a.appLabel || a.packageName).localeCompare(b.appLabel || b.packageName, "zh-CN");
    });
    refreshSummary();
    render();
    log("info", `\u8BFB\u53D6\u5230 ${state.apps.length} \u4E2A\u7528\u6237\u5E94\u7528\uFF0C\u5DF2\u4FDD\u5B58 ${state.saved.size} \u4E2A\u9009\u62E9\u3002`);
  } catch (error) {
    console.error(error);
    list.innerHTML = '<p class="error">\u65E0\u6CD5\u8BFB\u53D6\u5E94\u7528\u5217\u8868\u3002\u8BF7\u4ECE KernelSU \u7BA1\u7406\u5668\u5185\u6253\u5F00\u6B64 WebUI\uFF0C\u5E76\u786E\u8BA4\u5DF2\u6388\u4E88\u7BA1\u7406\u5668 Root \u6743\u9650\u3002</p>';
    count.textContent = "\u8BFB\u53D6\u5931\u8D25";
    log("err", `\u8BFB\u53D6\u5E94\u7528\u5217\u8868\u5931\u8D25\uFF1A${error.message || error}`);
  }
}
$("#search").addEventListener("input", (event) => {
  state.filter = event.target.value;
  render();
});
$("#clear-selection").addEventListener("click", () => {
  state.selected.clear();
  refreshSummary();
  render();
});
$("#select-visible").addEventListener("click", () => {
  const target = state.defaultTarget;
  for (const app of visibleApps()) if (!app.isSystem) state.selected.set(app.packageName, target);
  refreshSummary();
  render();
});
document.querySelectorAll(".nav-tab").forEach((button) => {
  button.addEventListener("click", () => switchTab(button.dataset.tab));
});
document.querySelectorAll("[data-log-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    state.logFilter = button.dataset.logFilter;
    renderLogs();
  });
});
$("#log-clear").addEventListener("click", () => {
  state.logs = [];
  renderLogs();
});
$("#log-refresh").addEventListener("click", async () => {
  log("info", "\u624B\u52A8\u5237\u65B0\u6302\u8F7D\u72B6\u6001\u2026");
  await updateMountStatus();
  toast("\u5DF2\u5237\u65B0\u6302\u8F7D\u72B6\u6001");
});
$("#save").addEventListener("click", () => {
  const entries = [...state.selected.entries()];
  const text = $("#confirm-text");
  const heading = document.createElement("span");
  heading.textContent = `\u5C06\u51C6\u5907 ${entries.length} \u4E2A\u5E94\u7528\uFF1A`;
  const rows = document.createElement("span");
  rows.className = "confirm-list";
  for (const [pkg, target] of entries) {
    const row = document.createElement("span");
    row.className = "confirm-line";
    const name = document.createElement("span");
    name.className = "confirm-line__pkg";
    name.textContent = pkg;
    const place = document.createElement("span");
    place.className = "confirm-line__target";
    place.textContent = targetLabel(target);
    row.append(name, place);
    rows.append(row);
  }
  text.replaceChildren(heading, rows);
  $("#confirm-error").hidden = true;
  $("#confirm-error").textContent = "";
  $("#confirm").textContent = "\u4FDD\u5B58\u5E76\u7B49\u5F85\u91CD\u542F";
  openModal($("#confirm-dialog"));
});
$("#cancel").addEventListener("click", () => $("#confirm-dialog").close());
$("#confirm").addEventListener("click", async () => {
  const dialog = $("#confirm-dialog");
  const button = $("#confirm");
  const errorBox = $("#confirm-error");
  button.disabled = true;
  button.textContent = "\u6B63\u5728\u590D\u5236 APK\u2026";
  try {
    log("info", `\u5F00\u59CB\u4FDD\u5B58 ${state.selected.size} \u4E2A\u9009\u62E9\u2026`);
    const result = await exec(`${CONTROL} apply ${encodeBase64(selectionLines())}`);
    if (result.errno !== 0) throw new Error(result.stderr || result.stdout || "\u672A\u77E5\u9519\u8BEF");
    log("ok", `\u4FDD\u5B58\u6210\u529F\uFF1A${(result.stdout || "").trim().replace(/^ERROR:\s*/, "")}`);
    dialog.close();
    toast("\u9009\u62E9\u5DF2\u4FDD\u5B58\u3002\u9700\u8981\u65F6\u8BF7\u4F7F\u7528\u9876\u90E8\u201C\u91CD\u542F\u201D\u3002");
    state.saved = new Map(state.selected);
    state.pendingReboot = true;
    refreshSummary();
    await updateMountStatus();
  } catch (error) {
    console.error(error);
    const message = String(error.message || error).replace(/^ERROR:\s*/, "").trim() || "\u672A\u77E5\u9519\u8BEF";
    errorBox.textContent = message;
    errorBox.hidden = false;
    log("err", `\u4FDD\u5B58\u5931\u8D25\uFF1A${message}`);
    toast("\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u5728\u5F39\u7A97\u6216\u65E5\u5FD7\u9875\u4E2D\u67E5\u770B\u539F\u56E0");
  } finally {
    button.disabled = false;
    button.textContent = "\u4FDD\u5B58\u5E76\u7B49\u5F85\u91CD\u542F";
  }
});
function closeModal(dialog) {
  if (dialog && dialog.open) dialog.close();
}
function openModal(dialog) {
  if (!dialog) return;
  dialog.showModal();
  dialog.focus();
}
function wireModalDismiss(dialog) {
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    closeModal(dialog);
  });
}
function openExternal(url) {
  const target = String(url).replace(/"/g, "");
  try {
    exec(`am start -a android.intent.action.VIEW -d "${target}" >/dev/null 2>&1`);
  } catch (_) {
    window.open(target, "_blank");
  }
}
$("#github-row").addEventListener("click", () => {
  openExternal("https://github.com/CNReporter/app-systemizer");
});
$("#reboot").addEventListener("click", () => {
  openModal($("#reboot-dialog"));
});
$("#reboot-cancel").addEventListener("click", () => closeModal($("#reboot-dialog")));
$("#reboot-confirm").addEventListener("click", () => {
  closeModal($("#reboot-dialog"));
  log("warn", "\u7528\u6237\u786E\u8BA4\u7ACB\u5373\u91CD\u542F\u8BBE\u5907\u3002");
  toast("\u6B63\u5728\u8BF7\u6C42 Root \u91CD\u542F\u2026");
  setTimeout(() => {
    exec("sync; /system/bin/reboot");
  }, 120);
});
wireModalDismiss($("#reboot-dialog"));
wireModalDismiss($("#confirm-dialog"));
$("#info-version").textContent = module_info_default.version;
$("#info-data-dir").textContent = `/data/adb/${module_info_default.id}`;
initThemeSheet();
initSettings();
initSystemColors();
initTargetSelect();
renderLogs();
initTopBar();
initPullGesture();
loadApps();
