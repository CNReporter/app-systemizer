import { exec, getPackagesInfo, listPackages, toast } from 'kernelsu';
import appSystemizer from './module-info.json';
import { initSystemColors } from './system-colors.js';
import { initTheme, applyTheme, normalizeHex, storeTheme, setForcedMode, PRESETS } from './theme.js';

const CONTROL = `/data/adb/modules/${appSystemizer.id}/scripts/app-systemizer.sh`;
const THEME_KEY = `${appSystemizer.id}-theme`;
const THEME_MODE_KEY = `${appSystemizer.id}-theme-mode`;
const MODE_LABELS = { system: '跟随系统', light: '亮色', dark: '暗色' };
const state = {
  apps: [],
  selected: new Map(),
  saved: new Map(),
  filter: '',
  logFilter: 'all',
  themeMode: 'system',
  logs: [],
  logEnabled: false,
  pendingReboot: false,
  refreshing: false,
  defaultTarget: 'app',
};
const $ = (selector) => document.querySelector(selector);
const list = $('#app-list');
const save = $('#save');
const count = $('#count');

function log(kind, text) {
  // Nothing is recorded until 设置 → 显示日志 is switched on.
  if (!state.logEnabled) return;
  const normalized = String(text == null ? '' : text).trim();
  state.logs.push({ time: new Date(), kind, text: normalized || '(空输出)' });
  if (state.logs.length > 300) state.logs.splice(0, state.logs.length - 300);
  if (!$('#panel-logs').hidden) renderLogs();
}

function renderLogs() {
  const entries = state.logEnabled ? state.logs : [];
  const counts = { ok: 0, info: 0, warn: 0, err: 0 };
  for (const entry of entries) counts[entry.kind] = (counts[entry.kind] || 0) + 1;

  $('#log-count-ok').textContent = `${counts.ok} OK`;
  $('#log-count-info').textContent = `${counts.info} 信息`;
  $('#log-count-warn').textContent = `${counts.warn} 警告`;
  $('#log-count-err').textContent = `${counts.err} 错误`;
  $('#log-hero-title').textContent = `今天 · ${entries.length} 条记录`;
  $('#log-hero-meta').textContent = entries.length
    ? `${entries[0].time.toLocaleTimeString('zh-CN', { hour12: false })} – ${entries[entries.length - 1].time.toLocaleTimeString('zh-CN', { hour12: false })} · 自动记录命令输出`
    : (state.logEnabled ? '还没有记录任何命令输出' : '日志已关闭，不记录任何输出');

  for (const button of document.querySelectorAll('[data-log-filter]')) {
    const active = button.dataset.logFilter === state.logFilter;
    button.classList.toggle('is-on', active);
    button.setAttribute('aria-pressed', String(active));
  }

  const box = $('#log-list');
  box.replaceChildren();
  const visible = entries.filter((entry) => state.logFilter === 'all' || entry.kind === state.logFilter);
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'log-empty';
    empty.textContent = entries.length
      ? '这个筛选下没有记录。'
      : (state.logEnabled ? '暂无日志。执行一次保存或刷新即可看到。' : '日志已关闭，不记录任何输出。');
    box.append(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const entry of [...visible].reverse()) {
    const line = document.createElement('div');
    line.className = 'log';
    const top = document.createElement('div');
    top.className = 'log__top';
    const time = document.createElement('span');
    time.className = 'log__time';
    time.textContent = entry.time.toLocaleTimeString('zh-CN', { hour12: false });
    const tag = document.createElement('span');
    tag.className = `tag ${entry.kind}`;
    tag.textContent = entry.kind === 'ok' ? 'OK' : entry.kind === 'err' ? '错误' : entry.kind === 'warn' ? '警告' : '信息';
    top.append(time, tag);
    const text = document.createElement('p');
    text.className = 'log__text';
    text.textContent = entry.text;
    line.append(top, text);
    fragment.append(line);
  }
  box.append(fragment);
}

function readStorage(key, fallback) {
  try {
    let value = localStorage.getItem(key);
    // One-time migration of preferences from the previous module name.
    const legacyKey = { 'app-systemizer-log-enabled': 'sap-log-enabled' }[key];
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
  try { localStorage.setItem(key, value); } catch (_) {  }
}

// The log tab only exists while 设置 → 显示日志 is on; leaving the page while
// it is hidden would strand the user on a tab with no navigation entry.
function syncLogTab() {
  const tab = document.querySelector('.nav-tab[data-tab="logs"]');
  if (!tab) return;
  tab.hidden = !state.logEnabled;
  if (!state.logEnabled && activeTab() === 'logs') switchTab('apps');
}

function initSettings() {
  state.logEnabled = readStorage(`${appSystemizer.id}-log-enabled`, '0') === '1';

  const logSwitch = $('#log-enabled');
  logSwitch.checked = state.logEnabled;
  syncLogTab();
  logSwitch.addEventListener('change', () => {
    if (logSwitch.checked) {
      state.logEnabled = true;
      writeStorage(`${appSystemizer.id}-log-enabled`, '1');
      log('info', '已开启显示日志，后续命令输出将记录在日志页。');
    } else {
      // Record the shutdown line while logging is still enabled.
      log('info', '已关闭显示日志，不再记录新的输出。');
      state.logEnabled = false;
      writeStorage(`${appSystemizer.id}-log-enabled`, '0');
    }
    syncLogTab();
    renderLogs();
  });
}

/* --------------------------------------------------------------- 主题色 */

let currentSeed = null;
let pendingSeed = null;
let themeCommitting = false;

function paintThemeRow() {
  $('#theme-value').textContent = currentSeed ? currentSeed.toUpperCase() : '系统取色';
}

function setThemeMode(mode, { persist = true } = {}) {
  const next = MODE_LABELS[mode] ? mode : 'system';
  state.themeMode = next;
  const root = document.documentElement;
  if (next === 'system') delete root.dataset.theme;
  else root.dataset.theme = next;
  setForcedMode(next);
  if (persist) writeStorage(THEME_MODE_KEY, next);
  const label = $('#theme-mode-value');
  if (label) label.textContent = MODE_LABELS[next];
  for (const item of document.querySelectorAll('[data-mode]')) {
    item.setAttribute('aria-selected', String(item.dataset.mode === next));
  }
  // 自定义色是按当前明暗派生出来的，切换模式后要重新算一遍。
  if (currentSeed) applyTheme(currentSeed);
}

function syncSwatches() {
  for (const button of document.querySelectorAll('[data-preset]')) {
    button.setAttribute('aria-pressed', String(pendingSeed === button.dataset.preset));
  }
}

function previewSeed(seed) {
  pendingSeed = seed;
  applyTheme(seed);
  syncSwatches();
  $('#theme-apply').disabled = !seed;
}

function openTheme() {
  pendingSeed = currentSeed;
  $('#theme-hex').value = currentSeed ? currentSeed.slice(1).toUpperCase() : '';
  previewSeed(currentSeed);
  $('#theme-dialog').showModal();
}

function initThemeSheet() {
  // 先定明暗，再应用自定义色，派生出来的才是对应模式的调色板。
  setThemeMode(readStorage(THEME_MODE_KEY, 'system'), { persist: false });
  currentSeed = initTheme(THEME_KEY);
  paintThemeRow();

  const swatches = $('#theme-swatches');
  for (const preset of PRESETS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'color';
    button.dataset.preset = preset.color;
    button.style.setProperty('--c', preset.color);
    button.setAttribute('aria-label', preset.name);
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
    button.addEventListener('click', () => {
      $('#theme-hex').value = preset.color.slice(1).toUpperCase();
      previewSeed(preset.color);
    });
    swatches.append(button);
  }

  const input = $('#theme-hex');
  input.addEventListener('input', () => {
    const raw = input.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6).toUpperCase();
    if (raw !== input.value) input.value = raw;
    const hex = raw.length === 6 ? normalizeHex(raw) : null;
    if (hex) {
      previewSeed(hex);
    } else {
      pendingSeed = null;
      applyTheme(currentSeed);
      syncSwatches();
      $('#theme-apply').disabled = true;
    }
  });

  $('#theme-clear').addEventListener('click', () => {
    input.value = '';
    input.focus();
    pendingSeed = null;
    applyTheme(currentSeed);
    syncSwatches();
    $('#theme-apply').disabled = true;
  });

  $('#theme-row').addEventListener('click', openTheme);
  $('#theme-close').addEventListener('click', () => $('#theme-dialog').close());

  $('#theme-apply').addEventListener('click', () => {
    if (!pendingSeed) return;
    themeCommitting = true;
    currentSeed = pendingSeed;
    storeTheme(THEME_KEY, currentSeed);
    $('#theme-dialog').close();
  });

  $('#theme-system').addEventListener('click', () => {
    themeCommitting = true;
    currentSeed = null;
    pendingSeed = null;
    storeTheme(THEME_KEY, null);
    applyTheme(null);
    $('#theme-dialog').close();
  });

  // 关闭（含 Esc / 点遮罩）时，未应用的选择回退到已保存的主题色。
  $('#theme-dialog').addEventListener('close', () => {
    if (!themeCommitting) applyTheme(currentSeed);
    themeCommitting = false;
    pendingSeed = currentSeed;
    paintThemeRow();
  });

  $('#theme-dialog').addEventListener('click', (event) => {
    if (event.target === $('#theme-dialog')) $('#theme-dialog').close();
  });

  const modeTrigger = $('#theme-mode-row');
  const modeMenu = $('#theme-mode-menu');
  const modeOptions = [...modeMenu.querySelectorAll('[data-mode]')];
  const closeModeMenu = ({ refocus = false } = {}) => {
    if (modeMenu.hidden) return;
    modeMenu.hidden = true;
    modeTrigger.setAttribute('aria-expanded', 'false');
    if (refocus) modeTrigger.focus({ preventScroll: true });
  };
  modeTrigger.addEventListener('click', () => {
    if (!modeMenu.hidden) { closeModeMenu(); return; }
    modeMenu.hidden = false;
    modeTrigger.setAttribute('aria-expanded', 'true');
    const current = modeOptions.find((item) => item.dataset.mode === state.themeMode) || modeOptions[0];
    current.focus({ preventScroll: true });
  });
  for (const option of modeOptions) {
    option.addEventListener('click', () => {
      setThemeMode(option.dataset.mode);
      closeModeMenu({ refocus: true });
    });
  }
  modeMenu.addEventListener('keydown', (event) => {
    const index = modeOptions.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      modeOptions[(index + step + modeOptions.length) % modeOptions.length].focus({ preventScroll: true });
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (index >= 0) modeOptions[index].click();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeModeMenu({ refocus: true });
    }
  });
  document.addEventListener('click', (event) => {
    if (modeMenu.hidden) return;
    if (event.target.closest('#theme-mode-row, #theme-mode-menu')) return;
    closeModeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModeMenu();
  });
}

const TAB_TITLES = { apps: '系统应用转换', logs: '运行日志', settings: '设置' };

function switchTab(name) {
  document.body.dataset.tab = name;
  // The bar title replaces the large page title once it scrolls away, so it has
  // to match the page it is above.
  $('.top-bar__title').textContent = TAB_TITLES[name] || TAB_TITLES.apps;
  document.querySelectorAll('.nav-tab').forEach((button) => {
    const active = button.dataset.tab === name;
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  document.querySelectorAll('.panel').forEach((panel) => {
    panel.hidden = panel.dataset.panel !== name;
  });
  if (name === 'logs') renderLogs();
  window.scrollTo(0, 0);
  // scrollTo does not fire a scroll event when the page was already at the top,
  // so reset the bar state explicitly.
  $('.top-bar').dataset.scrolled = 'false';
}

const PULL_THRESHOLD = 40;
const PULL_MAX = 72;
// Reduce visible travel to about 60% while retaining deliberate finger travel
// to refresh. Merely lowering the cap would make short pulls feel unchanged.
const PULL_RESISTANCE = 0.6;

const PULL_MAX_BOUNCE = 44;

function activeTab() {
  return document.body.dataset.tab || 'apps';
}

async function refreshAll() {
  if (state.refreshing) return;
  const tab = activeTab();
  if (tab === 'settings') return;
  state.refreshing = true;
  try {
    if (tab === 'logs') {
      // Read the latest collected entries without issuing a status command
      // or adding a synthetic refresh entry to the log.
      renderLogs();
      return;
    }
    const keepSelection = hasUnsavedChanges();
    log('info', keepSelection
      ? '下拉刷新：重新读取应用列表与挂载状态（保留未保存的修改）。'
      : '下拉刷新：重新读取应用列表与挂载状态。');
    await loadApps({ preserveSelection: keepSelection });
    if (keepSelection) toast('已刷新。未保存的修改已保留');
  } catch (error) {
    log('err', `刷新失败：${error.message || error}`);
  } finally {
    state.refreshing = false;
  }
}

// The large page title scrolls with the content; the fixed bar only shows its
// small copy once the page has moved. Driven here rather than by a CSS scroll
// timeline so it also works in browsers without scroll-driven animations.
function initTopBar() {
  const bar = $('.top-bar');
  const COLLAPSE_AT = 8;
  let ticking = false;
  const paint = () => {
    ticking = false;
    bar.dataset.scrolled = window.scrollY > COLLAPSE_AT ? 'true' : 'false';
  };
  const schedule = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(paint);
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  paint();
}

function initPullGesture() {
  const page = $('#page');
  const indicator = $('#pull-indicator');
  const indicatorText = $('#pull-text');
  let startX = 0;
  let startY = 0;
  let pullDirection = null;
  let allowDown = false;
  let allowUp = false;
  let pulling = false;
  let offset = 0;
  let busy = false;
  let settleTimer;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const setTransform = (value) => { page.style.transform = value === 0 ? 'none' : `translate3d(0, ${value}px, 0)`; };
  const animateTo = (value, duration) => {
    window.clearTimeout(settleTimer);
    const time = reducedMotion.matches ? 0 : duration;
    page.style.transition = time ? `transform ${time}ms cubic-bezier(.2, .8, .2, 1)` : '';
    setTransform(value);
    if (time) settleTimer = window.setTimeout(() => { page.style.transition = ''; }, time + 20);
  };
  const paintIndicator = () => {
    if (busy) return;
    if (activeTab() === 'settings' || pullDirection !== 'down') {
      indicator.style.opacity = '0';
      indicatorText.textContent = '';
      return;
    }
    indicator.style.opacity = String(Math.min(1, offset / PULL_THRESHOLD));
    indicatorText.textContent = offset >= PULL_THRESHOLD ? '松手刷新' : '下拉刷新';
  };
  const settle = () => animateTo(0, 240);

  document.addEventListener('touchstart', (event) => {
    allowDown = false;
    allowUp = false;
    if (busy || event.touches.length !== 1) return;
    if (event.target.closest('dialog, button, input, .bottom-nav')) return;
    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    pullDirection = null;
    pulling = false;
    offset = 0;
    // A pull is only possible when the drag starts at a scroll edge. When the
    // page is too short to scroll at all both edges are true, which is exactly
    // the case where the native stretch used to be missing.
    allowDown = window.scrollY <= 0;
    allowUp = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1;
  }, { passive: true });

  document.addEventListener('touchmove', (event) => {
    if (busy || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (!pulling) {
      if (Math.abs(deltaY) < 10) return;
      if (Math.abs(deltaX) > Math.abs(deltaY)) { allowDown = false; allowUp = false; return; }
      const goingDown = deltaY > 0;
      if (goingDown ? !allowDown : !allowUp) { allowDown = false; allowUp = false; return; }
      pulling = true;
      pullDirection = goingDown ? 'down' : 'up';
      window.clearTimeout(settleTimer);
      page.style.transition = '';
    }
    event.preventDefault();
    // Settings retain the elastic motion without a refresh indicator/action.
    const cap = activeTab() === 'settings' ? PULL_MAX_BOUNCE : PULL_MAX;
    offset = cap * (1 - Math.exp(-Math.abs(deltaY) * PULL_RESISTANCE / cap));
    setTransform(pullDirection === 'down' ? offset : -offset);
    paintIndicator();
  }, { passive: false });

  const release = async () => {
    if (!pulling) { pullDirection = null; return; }
    const canRefresh = activeTab() !== 'settings';
    const shouldRefresh = canRefresh && pullDirection === 'down' && offset >= PULL_THRESHOLD;
    pulling = false;
    pullDirection = null;
    if (!shouldRefresh) {
      offset = 0;
      settle();
      indicator.style.opacity = '0';
      return;
    }
    busy = true;
    offset = PULL_THRESHOLD;
    indicator.dataset.spin = 'true';
    indicatorText.textContent = '正在刷新…';
    animateTo(PULL_THRESHOLD, 160);
    try {
      await refreshAll();
    } finally {
      delete indicator.dataset.spin;
      busy = false;
      offset = 0;
      settle();
      indicator.style.opacity = '0';
      indicatorText.textContent = '下拉刷新';
    }
  };

  document.addEventListener('touchend', release);
  document.addEventListener('touchcancel', () => {
    pulling = false;
    pullDirection = null;
    offset = 0;
    if (!busy) {
      settle();
      indicator.style.opacity = '0';
    }
  });
}

function encodeBase64(value) {
  // btoa() only accepts Latin-1, so encode the UTF-8 bytes ourselves instead
  // of relying on the deprecated unescape() round-trip.
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function selectionLines() {
  // Map order is oldest to newest, so persist newest first for the next boot.
  const labels = new Map(state.apps.map((app) => [app.packageName, app.appLabel || '未命名应用']));
  const lines = [...state.selected.entries()].reverse().map(([pkg, target]) => `${pkg}|${target}|${encodeBase64(labels.get(pkg) || '未命名应用')}`).join('\n');
  // Keep one blank line so the Base64 payload remains a positional shell
  // argument when the user clears every module-managed application.
  return lines ? `${lines}\n` : '\n';
}

function targetLabel(target) {
  return target === 'priv-app' ? '/system/priv-app' : '/system/app';
}

// 安装位置是一个下拉框：触发器只显示当前目录，展开后二选一。
// 选择只影响此后新勾选的应用，已有选择保留各自的目标目录。
function initTargetSelect() {
  const trigger = $('#target-select');
  const menu = $('#target-menu');
  const value = $('#target-value');
  const options = [...menu.querySelectorAll('[data-target-option]')];

  const close = ({ refocus = false } = {}) => {
    if (menu.hidden) return;
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (refocus) trigger.focus({ preventScroll: true });
  };

  const open = () => {
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    const current = options.find((item) => item.dataset.targetOption === state.defaultTarget) || options[0];
    current.focus({ preventScroll: true });
  };

  const choose = (option) => {
    const next = option.dataset.targetOption;
    const changed = state.defaultTarget !== next;
    state.defaultTarget = next;
    value.textContent = targetLabel(next);
    for (const item of options) {
      item.setAttribute('aria-selected', String(item === option));
    }
    close({ refocus: true });
    if (changed) log('info', `目标目录切换为 ${targetLabel(next)}`);
  };

  trigger.addEventListener('click', () => (menu.hidden ? open() : close()));
  for (const option of options) {
    option.addEventListener('click', () => choose(option));
  }

  menu.addEventListener('keydown', (event) => {
    const index = options.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      options[(index + step + options.length) % options.length].focus({ preventScroll: true });
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (index >= 0) choose(options[index]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close({ refocus: true });
    }
  });

  document.addEventListener('click', (event) => {
    if (menu.hidden) return;
    if (event.target.closest('#target-select, #target-menu')) return;
    close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close({ refocus: true });
  });
}

function hasUnsavedChanges() {
  if (state.selected.size !== state.saved.size) return true;
  return [...state.selected].some(([pkg, target]) => state.saved.get(pkg) !== target);
}

function refreshSummary() {
  const size = state.selected.size;
  const changed = hasUnsavedChanges();
  const summary = $('#selection-summary');
  if (!size) {
    summary.textContent = '未选择应用';
  } else if (changed) {
    summary.textContent = `已选 ${size} 个 · 修改未保存`;
  } else if (state.pendingReboot) {
    summary.textContent = `已选 ${size} 个 · 等待重启`;
  } else {
    summary.textContent = `已选 ${size} 个 · 已生效`;
  }
  summary.dataset.state = changed ? 'dirty' : 'clean';
  // The extended FAB only exists while there is something to write.
  save.hidden = !changed;
  save.disabled = !changed;
  $('#save-label').textContent = size ? `保存 ${size} 项` : '保存更改';
  const clearButton = $('#clear-selection');
  if (clearButton) clearButton.disabled = size === 0;
}

async function updateMountStatus() {
  const card = $('#status-card');
  const setState = (stateName, title, chip, apps, hero, summary) => {
    if (card) card.dataset.state = stateName;
    $('#status-label').textContent = title;
    $('#status-chip').textContent = chip;
    $('#status-apps').textContent = String(apps);
    $('#status-hero').textContent = hero;
    $('#mount-status').textContent = summary;
  };
  try {
    const result = await exec(`${CONTROL} status`);
    const output = result.stdout || '';
    const metamoduleActive = /METAMODULE=active/.test(output);
    const metamoduleId = (output.match(/METAMODULE_ID=(.+)/) || [, ''])[1].trim();
    const systemMountActive = /SYSTEM_MOUNT=active/.test(output);
    const apps = Number((output.match(/MOUNTED_APPS=(\d+)/) || [, 0])[1]);
    const apks = Number((output.match(/STAGED_APKS=(\d+)/) || [, 0])[1]);
    // PENDING_REBOOT comes from the controller comparing the selections file
    // mtime with the kernel boot time, so it stays correct across WebUI restarts.
    const pending = /PENDING_REBOOT=1/.test(output);
    state.pendingReboot = pending;
    const metamodule = $('#info-metamodule');
    if (metamodule) metamodule.textContent = metamoduleId || (metamoduleActive ? 'Magic Mount-rs' : '未检测到');

    // One app can contribute several files (base APK + split APKs), so the
    // number is the mounted app count and the line below carries the APK count.
    if (!metamoduleActive) {
      setState('err', '未检测到挂载元模块', '需配置', 0, '个应用已托管', '请先安装并启用 Magic Mount-rs');
    } else if (pending) {
      setState('pending', '配置已保存，等待重启', '待重启', apps, '个应用待生效', `已暂存 ${apks} 个 APK 文件`);
    } else if (!apps) {
      setState('ok', '当前没有配置任何应用', '空', 0, '个应用已托管', '勾选应用并保存，重启后生效');
    } else if (!systemMountActive) {
      const other = metamoduleId && !/magic/i.test(metamoduleId);
      setState('warn',
        other ? '元模块不支持绑定挂载' : '已启用 Magic Mount-rs',
        other ? '未挂载' : '待挂载',
        apps, '个应用待挂载', `已暂存 ${apks} 个 APK 文件`);
    } else {
      setState('ok', '挂载已生效', '已生效', apps, '个应用已托管', `共 ${apks} 个 APK 文件 · 开机自动挂载`);
    }
    log(result.errno === 0 ? 'ok' : 'warn', `挂载检查：${output.trim() || '(空输出)'}`);
  } catch (error) {
    setState('err', '无法读取挂载状态', '错误', 0, '个应用已托管', '请从 KernelSU 管理器内打开此页面');
    log('err', `挂载检查失败：${error.message || error}`);
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
  count.title = `显示 ${apps.length} / ${state.apps.length} 个应用`;
  list.replaceChildren();
  if (!apps.length) {
    list.innerHTML = '<p class="empty">没有匹配的应用</p>';
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const app of apps) {
    const selectedTarget = state.selected.get(app.packageName);
    // A stock system package can never be promoted; promoted ones stay
    // editable so they can be unselected without clearing everything.
    const locked = app.isSystem && !state.saved.has(app.packageName);
    const row = document.createElement('div');
    row.className = `row${selectedTarget ? ' is-selected' : ''}${locked ? ' is-locked' : ''}`;
    row.setAttribute('role', 'checkbox');
    row.setAttribute('aria-checked', String(Boolean(selectedTarget)));
    if (locked) row.setAttribute('aria-disabled', 'true');
    row.setAttribute('tabindex', '0');
    const toggle = () => {
      const nowSelected = state.selected.has(app.packageName);
      if (!nowSelected && locked) return;
      if (nowSelected) state.selected.delete(app.packageName);
      else state.selected.set(app.packageName, state.defaultTarget);
      refreshSummary(); render();
    };
    row.addEventListener('click', (event) => {
      if (event.target.closest('button, a, input, select, img')) return;
      toggle();
    });
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); }
    });

    const icon = document.createElement('img');
    icon.className = 'row__icon'; icon.alt = ''; icon.src = `ksu://icon/${app.packageName}`;
    icon.onerror = () => { icon.style.visibility = 'hidden'; };

    const text = document.createElement('div');
    text.className = 'row__text';
    const name = document.createElement('span');
    name.className = 'row__title';
    name.textContent = app.appLabel || app.packageName;
    if (locked) {
      const tag = document.createElement('span');
      tag.className = 'row__tag';
      tag.textContent = '已是系统应用';
      name.append(tag);
    }
    const pkg = document.createElement('span');
    pkg.className = 'row__sub';
    pkg.textContent = selectedTarget ? `${app.packageName} · ${targetLabel(selectedTarget)}` : app.packageName;
    text.append(name, pkg);

    const check = document.createElement('span');
    check.className = `checkbox${selectedTarget ? ' is-on' : ''}`;
    check.setAttribute('aria-hidden', 'true');
    check.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';

    row.append(icon, text, check);
    fragment.append(row);
  }
  list.append(fragment);
}

async function loadSavedSelection() {
  const result = await exec(`${CONTROL} export`);
  if (result.errno !== 0 || !result.stdout.trim()) {
    if (result.errno !== 0) log('warn', `读取已保存选择失败：${result.stderr || result.stdout || '未知错误'}`);
    return;
  }
  state.selected.clear();
  state.saved.clear();
  const savedLines = [];
  for (const line of result.stdout.trim().split(/\r?\n/)) {
    const [pkg, target] = line.split('|');
    if (/^[A-Za-z0-9._]+$/.test(pkg) && ['app', 'priv-app'].includes(target)) savedLines.push([pkg, target]);
  }
  // The file starts with the newest selection; restore insertion order so new
  // selections naturally become the newest item when appended to the Map.
  state.selected = new Map(savedLines.reverse());
  state.saved = new Map(state.selected);
}

async function loadApps({ preserveSelection = false } = {}) {
  list.innerHTML = '<p class="empty">正在从 Package Manager 读取应用…</p>';
  try {
    await updateMountStatus();
    // A pull-to-refresh must not silently throw away edits the user has not
    // saved yet, so keep the in-memory selection in that case.
    if (!preserveSelection) await loadSavedSelection();
    const names = listPackages('all');
    const details = [];
    for (let i = 0; i < names.length; i += 80) details.push(...getPackagesInfo(names.slice(i, i + 80)));
    // Hide stock system packages completely. A package promoted by this module
    // remains visible (and can be unchecked) even after Package Manager marks it as a system app.
    const managedOrder = new Map([...state.selected.keys()].reverse().map((pkg, index) => [pkg, index]));
    state.apps = details
      .filter((app) => !app.isSystem || managedOrder.has(app.packageName))
      .sort((a, b) => {
        const aOrder = managedOrder.get(a.packageName);
        const bOrder = managedOrder.get(b.packageName);
        const aManaged = aOrder !== undefined;
        const bManaged = bOrder !== undefined;
        if (aManaged !== bManaged) return aManaged ? -1 : 1;
        if (aManaged && bManaged) return aOrder - bOrder;
        return (a.appLabel || a.packageName).localeCompare(b.appLabel || b.packageName, 'zh-CN');
      });
    refreshSummary(); render();
    log('info', `读取到 ${state.apps.length} 个用户应用，已保存 ${state.saved.size} 个选择。`);
  } catch (error) {
    console.error(error);
    list.innerHTML = '<p class="error">无法读取应用列表。请从 KernelSU 管理器内打开此 WebUI，并确认已授予管理器 Root 权限。</p>';
    count.textContent = '读取失败';
    log('err', `读取应用列表失败：${error.message || error}`);
  }
}

$('#search').addEventListener('input', (event) => { state.filter = event.target.value; render(); });
$('#clear-selection').addEventListener('click', () => { state.selected.clear(); refreshSummary(); render(); });
$('#select-visible').addEventListener('click', () => {
  const target = state.defaultTarget;
  for (const app of visibleApps()) if (!app.isSystem) state.selected.set(app.packageName, target);
  refreshSummary(); render();
});

document.querySelectorAll('.nav-tab').forEach((button) => {
  button.addEventListener('click', () => switchTab(button.dataset.tab));
});
document.querySelectorAll('[data-log-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    state.logFilter = button.dataset.logFilter;
    renderLogs();
  });
});
$('#log-clear').addEventListener('click', () => { state.logs = []; renderLogs(); });
$('#log-refresh').addEventListener('click', async () => {
  log('info', '手动刷新挂载状态…');
  await updateMountStatus();
  toast('已刷新挂载状态');
});

$('#save').addEventListener('click', () => {
  const entries = [...state.selected.entries()];
  const text = $('#confirm-text');
  const heading = document.createElement('span');
  heading.textContent = `将准备 ${entries.length} 个应用：`;
  const rows = document.createElement('span');
  rows.className = 'confirm-list';
  for (const [pkg, target] of entries) {
    const row = document.createElement('span');
    row.className = 'confirm-line';
    const name = document.createElement('span');
    name.className = 'confirm-line__pkg';
    name.textContent = pkg;
    const place = document.createElement('span');
    place.className = 'confirm-line__target';
    place.textContent = targetLabel(target);
    row.append(name, place);
    rows.append(row);
  }
  text.replaceChildren(heading, rows);
  $('#confirm-error').hidden = true;
  $('#confirm-error').textContent = '';
  $('#confirm').textContent = '保存并等待重启';
  openModal($('#confirm-dialog'));
});
$('#cancel').addEventListener('click', () => $('#confirm-dialog').close());
$('#confirm').addEventListener('click', async () => {
  const dialog = $('#confirm-dialog');
  const button = $('#confirm');
  const errorBox = $('#confirm-error');
  button.disabled = true; button.textContent = '正在复制 APK…';
  try {
    log('info', `开始保存 ${state.selected.size} 个选择…`);
    const result = await exec(`${CONTROL} apply ${encodeBase64(selectionLines())}`);
    if (result.errno !== 0) throw new Error(result.stderr || result.stdout || '未知错误');
    log('ok', `保存成功：${(result.stdout || '').trim().replace(/^ERROR:\s*/, '')}`);
    dialog.close(); toast('选择已保存。需要时请使用顶部“重启”。');
    state.saved = new Map(state.selected);
    // Assume a reboot is required until the controller says otherwise; the
    // status refresh right below confirms it from the selections file mtime.
    state.pendingReboot = true;
    refreshSummary();
    await updateMountStatus();
  } catch (error) {
    console.error(error);
    // Toasts truncate multi-line text, so keep the dialog open and show the
    // full controller report (per-app reason + diagnostics) here instead.
    const message = String(error.message || error).replace(/^ERROR:\s*/, '').trim() || '未知错误';
    errorBox.textContent = message;
    errorBox.hidden = false;
    log('err', `保存失败：${message}`);
    toast('保存失败，请在弹窗或日志页中查看原因');
  } finally {
    button.disabled = false; button.textContent = '保存并等待重启';
  }
});

function closeModal(dialog) {
  if (dialog && dialog.open) dialog.close();
}

// showModal() would focus the first button, which paints a focus ring on a
// touch-first UI. Put the initial focus on the dialog itself (tabindex="-1");
// Tab then moves into the actions as usual.
function openModal(dialog) {
  if (!dialog) return;
  dialog.showModal();
  dialog.focus();
}

function wireModalDismiss(dialog) {
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    closeModal(dialog);
  });
}

$('#reboot').addEventListener('click', () => {
  openModal($('#reboot-dialog'));
});
$('#reboot-cancel').addEventListener('click', () => closeModal($('#reboot-dialog')));
$('#reboot-confirm').addEventListener('click', () => {
  closeModal($('#reboot-dialog'));
  log('warn', '用户确认立即重启设备。');
  toast('正在请求 Root 重启…');
  // The process is intentionally not awaited: Android terminates the WebUI as
  // soon as the root reboot command is accepted.
  setTimeout(() => { exec('sync; /system/bin/reboot'); }, 120);
});
wireModalDismiss($('#reboot-dialog'));
wireModalDismiss($('#confirm-dialog'));

$('#info-version').textContent = appSystemizer.version;
$('#info-data-dir').textContent = `/data/adb/${appSystemizer.id}`;
initThemeSheet();
initSettings();
initSystemColors();
initTargetSelect();
renderLogs();
initTopBar();
initPullGesture();
loadApps();
