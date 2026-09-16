import { exec, getPackagesInfo, listPackages, toast } from 'kernelsu';
import appSystemizer from './module-info.json';
import { applySystemColors, initSystemColors } from './system-colors.js';

const CONTROL = `/data/adb/modules/${appSystemizer.id}/scripts/app-systemizer.sh`;
const state = {
  apps: [],
  selected: new Map(),
  saved: new Map(),
  filter: '',
  logs: [],
  logEnabled: false,
  theme: 'md3',
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
  const box = $('#log-list');
  box.replaceChildren();
  const visible = state.logEnabled ? state.logs : [];
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'log-empty';
    empty.textContent = state.logEnabled ? '暂无日志。执行一次保存或刷新即可看到。' : '日志已关闭，不记录任何输出。';
    box.append(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const entry of [...visible].reverse()) {
    const line = document.createElement('div');
    line.className = 'log-line';
    const time = document.createElement('span');
    time.className = 'log-time';
    time.textContent = entry.time.toLocaleTimeString('zh-CN', { hour12: false });
    const badge = document.createElement('span');
    badge.className = `log-badge ${entry.kind}`;
    badge.textContent = entry.kind === 'ok' ? 'OK' : entry.kind === 'err' ? '错误' : entry.kind === 'warn' ? '警告' : '信息';
    const text = document.createElement('span');
    text.className = 'log-text';
    text.textContent = entry.text;
    line.append(time, badge, text);
    fragment.append(line);
  }
  box.append(fragment);
}

function readStorage(key, fallback) {
  try {
    let value = localStorage.getItem(key);
    // One-time migration of preferences from the previous module name.
    const legacyKey = { 'app-systemizer-theme': 'sap-theme', 'app-systemizer-log-enabled': 'sap-log-enabled' }[key];
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

function applyTheme() {
  const root = document.documentElement;
  root.classList.remove('theme-miuix', 'theme-md3');
  root.classList.add(`theme-${state.theme}`);
  applySystemColors();
  closeThemeMenu();
  $('#theme-options').setAttribute('role', state.theme === 'miuix' ? 'listbox' : 'group');
  document.querySelectorAll('[data-theme-option]').forEach((button) => {
    button.classList.toggle('active', button.dataset.themeOption === state.theme);
    button.setAttribute('role', state.theme === 'miuix' ? 'option' : 'button');
    if (state.theme === 'miuix') {
      button.setAttribute('aria-selected', String(button.dataset.themeOption === state.theme));
      button.removeAttribute('aria-pressed');
    } else {
      button.setAttribute('aria-pressed', String(button.dataset.themeOption === state.theme));
      button.removeAttribute('aria-selected');
    }
  });
}

function closeThemeMenu({ restoreFocus = false } = {}) {
  $('#theme-picker').dataset.themeMenu = 'false';
  $('#miuix-theme-trigger').setAttribute('aria-expanded', 'false');
  if (restoreFocus && state.theme === 'miuix') $('#miuix-theme-trigger').focus();
}

function initThemeMenu() {
  const picker = $('#theme-picker');
  const trigger = $('#miuix-theme-trigger');
  const options = [...picker.querySelectorAll('[data-theme-option]')];
  const open = () => {
    picker.dataset.themeMenu = 'true';
    trigger.setAttribute('aria-expanded', 'true');
    options.find(option => option.dataset.themeOption === state.theme).focus({ preventScroll: true });
  };
  trigger.addEventListener('click', () => picker.dataset.themeMenu === 'true' ? closeThemeMenu() : open());
  trigger.addEventListener('keydown', event => {
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); open(); }
  });
  $('#theme-options').addEventListener('keydown', event => {
    if (state.theme !== 'miuix') return;
    if (event.key === 'Escape') { event.preventDefault(); closeThemeMenu({ restoreFocus: true }); }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const current = options.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options[next].focus({ preventScroll: true });
    }
  });
  document.addEventListener('pointerdown', event => { if (!picker.contains(event.target)) closeThemeMenu(); });
  document.addEventListener('focusin', event => { if (!picker.contains(event.target)) closeThemeMenu(); });
}

function initSettings() {
  const savedTheme = readStorage(`${appSystemizer.id}-theme`, 'md3');
  state.theme = savedTheme === 'miuix' ? 'miuix' : 'md3';
  state.logEnabled = readStorage(`${appSystemizer.id}-log-enabled`, '0') === '1';

  applyTheme();
  document.querySelectorAll('[data-theme-option]').forEach((button) => {
    button.addEventListener('click', () => {
      state.theme = button.dataset.themeOption;
      writeStorage(`${appSystemizer.id}-theme`, state.theme);
      applyTheme();
      if (state.theme === 'miuix') $('#miuix-theme-trigger').focus({ preventScroll: true });
      log('info', `UI 风格切换为 ${state.theme === 'md3' ? 'Material 3' : 'Miuix'}`);
    });
  });
  const logSwitch = $('#log-enabled');
  logSwitch.checked = state.logEnabled;
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
    renderLogs();
  });
}

function switchTab(name) {
  closeTargetMenu();
  closeThemeMenu();
  document.body.dataset.tab = name;
  document.querySelectorAll('.nav-tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === name);
  });
  document.querySelectorAll('.panel').forEach((panel) => {
    panel.hidden = panel.dataset.panel !== name;
  });
  if (name === 'logs') renderLogs();
  window.scrollTo(0, 0);
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
    if (event.target.closest('.target-select, dialog, button, input, .bottom-nav')) return;
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
  return btoa(unescape(encodeURIComponent(value)));
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

function closeTargetMenu({ restoreFocus = false } = {}) {
  $('#target-menu').hidden = true;
  $('#target-default').setAttribute('aria-expanded', 'false');
  if (restoreFocus) $('#target-default').focus();
}

function initTargetMenu() {
  const trigger = $('#target-default');
  const menu = $('#target-menu');
  const options = [...menu.querySelectorAll('[role="option"]')];
  const open = (index = options.findIndex((option) => option.dataset.value === state.defaultTarget)) => {
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    options[index].focus({ preventScroll: true });
  };
  trigger.addEventListener('click', () => menu.hidden ? open() : closeTargetMenu());
  trigger.addEventListener('keydown', (event) => {
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      open(event.key === 'ArrowUp' ? options.length - 1 : undefined);
    }
  });
  for (const option of options) {
    option.addEventListener('click', () => {
      state.defaultTarget = option.dataset.value;
      $('#target-value').textContent = targetLabel(state.defaultTarget);
      for (const item of options) item.setAttribute('aria-selected', String(item === option));
      closeTargetMenu({ restoreFocus: true });
    });
  }
  menu.addEventListener('keydown', (event) => {
    const index = options.indexOf(document.activeElement);
    const next = {
      ArrowDown: (index + 1) % options.length,
      ArrowUp: (index - 1 + options.length) % options.length,
      Home: 0,
      End: options.length - 1,
    }[event.key];
    if (next !== undefined) {
      event.preventDefault();
      options[next].focus({ preventScroll: true });
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) {
      event.preventDefault();
      closeTargetMenu({ restoreFocus: true });
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.target-select')) closeTargetMenu();
  });
  document.addEventListener('focusin', (event) => {
    if (!event.target.closest('.target-select')) closeTargetMenu();
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
    summary.textContent = `已选 ${size} 个应用，修改尚未保存`;
  } else if (state.pendingReboot) {
    summary.textContent = `已选 ${size} 个应用，已保存，重启后生效`;
  } else {
    summary.textContent = `已选 ${size} 个应用，配置已生效`;
  }
  save.disabled = !changed;
  const clearButton = $('#clear-selection');
  if (clearButton) clearButton.disabled = size === 0;
}

async function updateMountStatus() {
  const card = $('#status-card');
  const label = $('#status-label');
  const element = $('#mount-status');
  const setState = (stateName, title, summary) => {
    if (card) card.dataset.state = stateName;
    if (label) label.textContent = title;
    if (element) element.textContent = summary;
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
    // One app can contribute several files (base APK + split APKs), so always
    // show both counts to avoid the "3 apps but 4 APKs" confusion.
    const stagedText = `${apps} 个应用（${apks} 个 APK 文件）`;
    if (!metamoduleActive) {
      setState('err', '未检测到挂载元模块', '请先安装并启用 Magic Mount-rs，否则重启后不会成为系统应用。');
    } else if (pending) {
      setState('pending', '配置已保存，等待重启', `已保存 ${stagedText} 的新配置，重启后才会挂载生效。`);
    } else if (!apps) {
      setState('ok', '当前没有配置任何应用', '勾选应用并保存，重启后即可成为系统应用。');
    } else if (!systemMountActive) {
      const other = metamoduleId && !/magic/i.test(metamoduleId);
      setState('warn',
        other ? `当前元模块为 ${metamoduleId}` : '已启用 Magic Mount-rs',
        other ? `未检测到绑定挂载；已暂存 ${stagedText}，建议改用 Magic Mount-rs 后重启。` : `已暂存 ${stagedText}，但未检测到挂载，请重启后查看。`);
    } else {
      setState('ok', '挂载已生效', `当前已挂载 ${stagedText}。`);
    }
    log(result.errno === 0 ? 'ok' : 'warn', `挂载检查：${output.trim() || '(空输出)'}`);
  } catch (error) {
    setState('err', '无法读取挂载状态', '请确认从 KernelSU Manager 内打开本页面。');
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
  count.textContent = `显示 ${apps.length} / ${state.apps.length} 个应用`;
  list.replaceChildren();
  if (!apps.length) {
    list.innerHTML = '<p class="empty">没有匹配的应用</p>';
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const app of apps) {
    const selectedTarget = state.selected.get(app.packageName);
    const row = document.createElement('div');
    row.className = `app ${selectedTarget ? 'selected' : ''}`;
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    const toggle = () => {
      const nowSelected = state.selected.has(app.packageName);
      // A stock system package can never be promoted; promoted ones stay
      // editable so they can be unselected without clearing everything.
      if (!nowSelected && app.isSystem && !state.saved.has(app.packageName)) return;
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
    const check = document.createElement('span');
    check.className = 'checkbox';
    check.setAttribute('aria-hidden', 'true');
    check.dataset.checked = selectedTarget ? 'true' : 'false';
    const icon = document.createElement('img');
    icon.className = 'app-icon'; icon.alt = ''; icon.src = `ksu://icon/${app.packageName}`;
    icon.onerror = () => { icon.style.visibility = 'hidden'; };
    const info = document.createElement('div');
    info.className = 'app-info';
    const name = document.createElement('div'); name.className = 'app-name'; name.textContent = app.appLabel || app.packageName;
    const pkg = document.createElement('div'); pkg.className = 'package'; pkg.textContent = app.packageName;
    info.append(name, pkg);
    row.append(check, icon, info);
    if (selectedTarget) {
      const side = document.createElement('div');
      side.className = 'side-badge target'; side.textContent = `本模块管理 · ${targetLabel(selectedTarget)}`;
      row.append(side);
    } else if (app.isSystem) {
      const side = document.createElement('div');
      side.className = 'side-badge badge'; side.textContent = '已是系统应用';
      row.append(side);
    }
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
$('#log-clear').addEventListener('click', () => { state.logs = []; renderLogs(); });
$('#log-refresh').addEventListener('click', async () => {
  log('info', '手动刷新挂载状态…');
  await updateMountStatus();
  toast('已刷新挂载状态');
});

$('#save').addEventListener('click', () => {
  const apps = [...state.selected.entries()].map(([pkg, target]) => `${pkg} → ${targetLabel(target)}`);
  $('#confirm-text').textContent = `将准备 ${apps.length} 个应用：${apps.slice(0, 3).join('、')}${apps.length > 3 ? '…' : ''}`;
  $('#confirm-error').hidden = true;
  $('#confirm-error').textContent = '';
  $('#confirm').textContent = '保存并等待重启';
  $('#confirm-dialog').showModal();
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

function wireModalDismiss(dialog) {
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    closeModal(dialog);
  });
}

$('#reboot').addEventListener('click', () => {
  $('#reboot-dialog').showModal();
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
initSettings();
initThemeMenu();
initSystemColors();
initTargetMenu();
renderLogs();
initPullGesture();
loadApps();
