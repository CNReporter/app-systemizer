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
  version: "1.2.8(260916)",
  versionCode: 260916
};

// module/webroot/system-colors.js
var roles = {
  primary: "primary",
  onPrimary: "on_primary",
  primaryContainer: "primary_container",
  onPrimaryContainer: "on_primary_container",
  secondaryContainer: "secondary_container",
  onSecondaryContainer: "on_secondary_container",
  background: "surface",
  surface: "surface",
  surfaceContainer: "surface_container",
  surfaceContainerHigh: "surface_container_high",
  surfaceContainerHighest: "surface_container_highest",
  onSurface: "on_surface",
  onSurfaceVariant: "on_surface_variant",
  outline: "outline",
  outlineVariant: "outline_variant",
  error: "error",
  errorContainer: "error_container",
  onErrorContainer: "on_error_container"
};
var required = ["primary", "onPrimary", "primaryContainer", "onPrimaryContainer", "secondaryContainer", "onSecondaryContainer"];
var accentProperties = {
  "--primary": "primary",
  "--on-primary": "onPrimary",
  "--on-change-bg": "primaryContainer",
  "--app-selected-bg": "primaryContainer",
  "--secondary-container": "secondaryContainer",
  "--on-secondary-container": "onSecondaryContainer"
};
var materialProperties = {
  "--bg": "background",
  "--surface": "surface",
  "--surface-container": "surfaceContainer",
  "--surface-hover": "surfaceContainerHighest",
  "--menu-surface": "surfaceContainerHigh",
  "--text": "onSurface",
  "--text-secondary": "onSurfaceVariant",
  "--text-tertiary": "outline",
  "--divider": "outlineVariant",
  "--outline": "outline",
  "--danger": "error",
  "--danger-bg": "errorContainer",
  "--switch-track": "outlineVariant",
  "--switch-thumb": "onSurfaceVariant"
};
var ownedProperties = [...Object.keys(accentProperties), ...Object.keys(materialProperties), "--primary-hover", "--menu-pressed"];
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
  if (!root.classList.contains("theme-md3")) return;
  const palette = palettes.get(colorScheme.matches);
  if (!palette) return;
  const properties = { ...accentProperties, ...materialProperties };
  for (const [property, role] of Object.entries(properties)) {
    if (palette.colors[role]) root.style.setProperty(property, palette.colors[role]);
  }
  root.style.setProperty("--primary-hover", "color-mix(in srgb, var(--primary) 88%, var(--on-primary))");
  root.style.setProperty("--menu-pressed", "color-mix(in srgb, var(--primary) 24%, var(--secondary-container))");
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

// module/webroot/app.js
var CONTROL = `/data/adb/modules/${module_info_default.id}/scripts/app-systemizer.sh`;
var state = {
  apps: [],
  selected: /* @__PURE__ */ new Map(),
  saved: /* @__PURE__ */ new Map(),
  filter: "",
  logs: [],
  logEnabled: false,
  theme: "md3",
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
  const box = $("#log-list");
  box.replaceChildren();
  const visible = state.logEnabled ? state.logs : [];
  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "log-empty";
    empty.textContent = state.logEnabled ? "\u6682\u65E0\u65E5\u5FD7\u3002\u6267\u884C\u4E00\u6B21\u4FDD\u5B58\u6216\u5237\u65B0\u5373\u53EF\u770B\u5230\u3002" : "\u65E5\u5FD7\u5DF2\u5173\u95ED\uFF0C\u4E0D\u8BB0\u5F55\u4EFB\u4F55\u8F93\u51FA\u3002";
    box.append(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const entry of [...visible].reverse()) {
    const line = document.createElement("div");
    line.className = "log-line";
    const time = document.createElement("span");
    time.className = "log-time";
    time.textContent = entry.time.toLocaleTimeString("zh-CN", { hour12: false });
    const badge = document.createElement("span");
    badge.className = `log-badge ${entry.kind}`;
    badge.textContent = entry.kind === "ok" ? "OK" : entry.kind === "err" ? "\u9519\u8BEF" : entry.kind === "warn" ? "\u8B66\u544A" : "\u4FE1\u606F";
    const text = document.createElement("span");
    text.className = "log-text";
    text.textContent = entry.text;
    line.append(time, badge, text);
    fragment.append(line);
  }
  box.append(fragment);
}
function readStorage(key, fallback) {
  try {
    let value = localStorage.getItem(key);
    const legacyKey = { "app-systemizer-theme": "sap-theme", "app-systemizer-log-enabled": "sap-log-enabled" }[key];
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
function applyTheme() {
  const root = document.documentElement;
  root.classList.remove("theme-miuix", "theme-md3");
  root.classList.add(`theme-${state.theme}`);
  applySystemColors();
  closeThemeMenu();
  $("#theme-options").setAttribute("role", state.theme === "miuix" ? "listbox" : "group");
  document.querySelectorAll("[data-theme-option]").forEach((button) => {
    button.classList.toggle("active", button.dataset.themeOption === state.theme);
    button.setAttribute("role", state.theme === "miuix" ? "option" : "button");
    if (state.theme === "miuix") {
      button.setAttribute("aria-selected", String(button.dataset.themeOption === state.theme));
      button.removeAttribute("aria-pressed");
    } else {
      button.setAttribute("aria-pressed", String(button.dataset.themeOption === state.theme));
      button.removeAttribute("aria-selected");
    }
  });
}
function closeThemeMenu({ restoreFocus = false } = {}) {
  $("#theme-picker").dataset.themeMenu = "false";
  $("#miuix-theme-trigger").setAttribute("aria-expanded", "false");
  if (restoreFocus && state.theme === "miuix") $("#miuix-theme-trigger").focus();
}
function initThemeMenu() {
  const picker = $("#theme-picker");
  const trigger = $("#miuix-theme-trigger");
  const options = [...picker.querySelectorAll("[data-theme-option]")];
  const open = () => {
    picker.dataset.themeMenu = "true";
    trigger.setAttribute("aria-expanded", "true");
    options.find((option) => option.dataset.themeOption === state.theme).focus({ preventScroll: true });
  };
  trigger.addEventListener("click", () => picker.dataset.themeMenu === "true" ? closeThemeMenu() : open());
  trigger.addEventListener("keydown", (event) => {
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      open();
    }
  });
  $("#theme-options").addEventListener("keydown", (event) => {
    if (state.theme !== "miuix") return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeThemeMenu({ restoreFocus: true });
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const current = options.indexOf(document.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
      options[next].focus({ preventScroll: true });
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!picker.contains(event.target)) closeThemeMenu();
  });
  document.addEventListener("focusin", (event) => {
    if (!picker.contains(event.target)) closeThemeMenu();
  });
}
function initSettings() {
  const savedTheme = readStorage(`${module_info_default.id}-theme`, "md3");
  state.theme = savedTheme === "miuix" ? "miuix" : "md3";
  state.logEnabled = readStorage(`${module_info_default.id}-log-enabled`, "0") === "1";
  applyTheme();
  document.querySelectorAll("[data-theme-option]").forEach((button) => {
    button.addEventListener("click", () => {
      state.theme = button.dataset.themeOption;
      writeStorage(`${module_info_default.id}-theme`, state.theme);
      applyTheme();
      if (state.theme === "miuix") $("#miuix-theme-trigger").focus({ preventScroll: true });
      log("info", `UI \u98CE\u683C\u5207\u6362\u4E3A ${state.theme === "md3" ? "Material 3" : "Miuix"}`);
    });
  });
  const logSwitch = $("#log-enabled");
  logSwitch.checked = state.logEnabled;
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
    renderLogs();
  });
}
function switchTab(name) {
  closeTargetMenu();
  closeThemeMenu();
  document.body.dataset.tab = name;
  document.querySelectorAll(".nav-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === name);
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== name;
  });
  if (name === "logs") renderLogs();
  window.scrollTo(0, 0);
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
    if (event.target.closest(".target-select, dialog, button, input, .bottom-nav")) return;
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
  return btoa(unescape(encodeURIComponent(value)));
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
function closeTargetMenu({ restoreFocus = false } = {}) {
  $("#target-menu").hidden = true;
  $("#target-default").setAttribute("aria-expanded", "false");
  if (restoreFocus) $("#target-default").focus();
}
function initTargetMenu() {
  const trigger = $("#target-default");
  const menu = $("#target-menu");
  const options = [...menu.querySelectorAll('[role="option"]')];
  const open = (index = options.findIndex((option) => option.dataset.value === state.defaultTarget)) => {
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    options[index].focus({ preventScroll: true });
  };
  trigger.addEventListener("click", () => menu.hidden ? open() : closeTargetMenu());
  trigger.addEventListener("keydown", (event) => {
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      open(event.key === "ArrowUp" ? options.length - 1 : void 0);
    }
  });
  for (const option of options) {
    option.addEventListener("click", () => {
      state.defaultTarget = option.dataset.value;
      $("#target-value").textContent = targetLabel(state.defaultTarget);
      for (const item of options) item.setAttribute("aria-selected", String(item === option));
      closeTargetMenu({ restoreFocus: true });
    });
  }
  menu.addEventListener("keydown", (event) => {
    const index = options.indexOf(document.activeElement);
    const next = {
      ArrowDown: (index + 1) % options.length,
      ArrowUp: (index - 1 + options.length) % options.length,
      Home: 0,
      End: options.length - 1
    }[event.key];
    if (next !== void 0) {
      event.preventDefault();
      options[next].focus({ preventScroll: true });
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      event.preventDefault();
      closeTargetMenu({ restoreFocus: true });
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".target-select")) closeTargetMenu();
  });
  document.addEventListener("focusin", (event) => {
    if (!event.target.closest(".target-select")) closeTargetMenu();
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
    summary.textContent = `\u5DF2\u9009 ${size} \u4E2A\u5E94\u7528\uFF0C\u4FEE\u6539\u5C1A\u672A\u4FDD\u5B58`;
  } else if (state.pendingReboot) {
    summary.textContent = `\u5DF2\u9009 ${size} \u4E2A\u5E94\u7528\uFF0C\u5DF2\u4FDD\u5B58\uFF0C\u91CD\u542F\u540E\u751F\u6548`;
  } else {
    summary.textContent = `\u5DF2\u9009 ${size} \u4E2A\u5E94\u7528\uFF0C\u914D\u7F6E\u5DF2\u751F\u6548`;
  }
  save.disabled = !changed;
  const clearButton = $("#clear-selection");
  if (clearButton) clearButton.disabled = size === 0;
}
async function updateMountStatus() {
  const card = $("#status-card");
  const label = $("#status-label");
  const element = $("#mount-status");
  const setState = (stateName, title, summary) => {
    if (card) card.dataset.state = stateName;
    if (label) label.textContent = title;
    if (element) element.textContent = summary;
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
    const stagedText = `${apps} \u4E2A\u5E94\u7528\uFF08${apks} \u4E2A APK \u6587\u4EF6\uFF09`;
    if (!metamoduleActive) {
      setState("err", "\u672A\u68C0\u6D4B\u5230\u6302\u8F7D\u5143\u6A21\u5757", "\u8BF7\u5148\u5B89\u88C5\u5E76\u542F\u7528 Magic Mount-rs\uFF0C\u5426\u5219\u91CD\u542F\u540E\u4E0D\u4F1A\u6210\u4E3A\u7CFB\u7EDF\u5E94\u7528\u3002");
    } else if (pending) {
      setState("pending", "\u914D\u7F6E\u5DF2\u4FDD\u5B58\uFF0C\u7B49\u5F85\u91CD\u542F", `\u5DF2\u4FDD\u5B58 ${stagedText} \u7684\u65B0\u914D\u7F6E\uFF0C\u91CD\u542F\u540E\u624D\u4F1A\u6302\u8F7D\u751F\u6548\u3002`);
    } else if (!apps) {
      setState("ok", "\u5F53\u524D\u6CA1\u6709\u914D\u7F6E\u4EFB\u4F55\u5E94\u7528", "\u52FE\u9009\u5E94\u7528\u5E76\u4FDD\u5B58\uFF0C\u91CD\u542F\u540E\u5373\u53EF\u6210\u4E3A\u7CFB\u7EDF\u5E94\u7528\u3002");
    } else if (!systemMountActive) {
      const other = metamoduleId && !/magic/i.test(metamoduleId);
      setState(
        "warn",
        other ? `\u5F53\u524D\u5143\u6A21\u5757\u4E3A ${metamoduleId}` : "\u5DF2\u542F\u7528 Magic Mount-rs",
        other ? `\u672A\u68C0\u6D4B\u5230\u7ED1\u5B9A\u6302\u8F7D\uFF1B\u5DF2\u6682\u5B58 ${stagedText}\uFF0C\u5EFA\u8BAE\u6539\u7528 Magic Mount-rs \u540E\u91CD\u542F\u3002` : `\u5DF2\u6682\u5B58 ${stagedText}\uFF0C\u4F46\u672A\u68C0\u6D4B\u5230\u6302\u8F7D\uFF0C\u8BF7\u91CD\u542F\u540E\u67E5\u770B\u3002`
      );
    } else {
      setState("ok", "\u6302\u8F7D\u5DF2\u751F\u6548", `\u5F53\u524D\u5DF2\u6302\u8F7D ${stagedText}\u3002`);
    }
    log(result.errno === 0 ? "ok" : "warn", `\u6302\u8F7D\u68C0\u67E5\uFF1A${output.trim() || "(\u7A7A\u8F93\u51FA)"}`);
  } catch (error) {
    setState("err", "\u65E0\u6CD5\u8BFB\u53D6\u6302\u8F7D\u72B6\u6001", "\u8BF7\u786E\u8BA4\u4ECE KernelSU Manager \u5185\u6253\u5F00\u672C\u9875\u9762\u3002");
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
  count.textContent = `\u663E\u793A ${apps.length} / ${state.apps.length} \u4E2A\u5E94\u7528`;
  list.replaceChildren();
  if (!apps.length) {
    list.innerHTML = '<p class="empty">\u6CA1\u6709\u5339\u914D\u7684\u5E94\u7528</p>';
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const app of apps) {
    const selectedTarget = state.selected.get(app.packageName);
    const row = document.createElement("div");
    row.className = `app ${selectedTarget ? "selected" : ""}`;
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    const toggle = () => {
      const nowSelected = state.selected.has(app.packageName);
      if (!nowSelected && app.isSystem && !state.saved.has(app.packageName)) return;
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
    const check = document.createElement("span");
    check.className = "checkbox";
    check.setAttribute("aria-hidden", "true");
    check.dataset.checked = selectedTarget ? "true" : "false";
    const icon = document.createElement("img");
    icon.className = "app-icon";
    icon.alt = "";
    icon.src = `ksu://icon/${app.packageName}`;
    icon.onerror = () => {
      icon.style.visibility = "hidden";
    };
    const info = document.createElement("div");
    info.className = "app-info";
    const name = document.createElement("div");
    name.className = "app-name";
    name.textContent = app.appLabel || app.packageName;
    const pkg = document.createElement("div");
    pkg.className = "package";
    pkg.textContent = app.packageName;
    info.append(name, pkg);
    row.append(check, icon, info);
    if (selectedTarget) {
      const side = document.createElement("div");
      side.className = "side-badge target";
      side.textContent = `\u672C\u6A21\u5757\u7BA1\u7406 \xB7 ${targetLabel(selectedTarget)}`;
      row.append(side);
    } else if (app.isSystem) {
      const side = document.createElement("div");
      side.className = "side-badge badge";
      side.textContent = "\u5DF2\u662F\u7CFB\u7EDF\u5E94\u7528";
      row.append(side);
    }
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
  const apps = [...state.selected.entries()].map(([pkg, target]) => `${pkg} \u2192 ${targetLabel(target)}`);
  $("#confirm-text").textContent = `\u5C06\u51C6\u5907 ${apps.length} \u4E2A\u5E94\u7528\uFF1A${apps.slice(0, 3).join("\u3001")}${apps.length > 3 ? "\u2026" : ""}`;
  $("#confirm-error").hidden = true;
  $("#confirm-error").textContent = "";
  $("#confirm").textContent = "\u4FDD\u5B58\u5E76\u7B49\u5F85\u91CD\u542F";
  $("#confirm-dialog").showModal();
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
function wireModalDismiss(dialog) {
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    closeModal(dialog);
  });
}
$("#reboot").addEventListener("click", () => {
  $("#reboot-dialog").showModal();
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
initSettings();
initThemeMenu();
initSystemColors();
initTargetMenu();
renderLogs();
initPullGesture();
loadApps();
