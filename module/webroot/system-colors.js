import { exec } from 'kernelsu';

// KernelSU's MonetColorsProvider exports these roles at /internal/colors.css.
// Keep the provider's variables isolated: its --primary would otherwise be
// overwritten by the module's theme defaults.
const roles = {
  primary: 'primary', onPrimary: 'on_primary',
  primaryContainer: 'primary_container', onPrimaryContainer: 'on_primary_container',
  secondaryContainer: 'secondary_container', onSecondaryContainer: 'on_secondary_container',
  background: 'surface', surface: 'surface',
  surfaceContainer: 'surface_container', surfaceContainerHigh: 'surface_container_high',
  surfaceContainerHighest: 'surface_container_highest',
  onSurface: 'on_surface', onSurfaceVariant: 'on_surface_variant',
  outline: 'outline', outlineVariant: 'outline_variant',
  error: 'error', errorContainer: 'error_container', onErrorContainer: 'on_error_container',
};
const required = ['primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer', 'secondaryContainer', 'onSecondaryContainer'];
const accentProperties = {
  '--primary': 'primary', '--on-primary': 'onPrimary',
  '--on-change-bg': 'primaryContainer', '--app-selected-bg': 'primaryContainer',
  '--secondary-container': 'secondaryContainer', '--on-secondary-container': 'onSecondaryContainer',
};
const materialProperties = {
  '--bg': 'background', '--surface': 'surface', '--surface-container': 'surfaceContainer',
  '--surface-hover': 'surfaceContainerHighest', '--menu-surface': 'surfaceContainerHigh',
  '--text': 'onSurface', '--text-secondary': 'onSurfaceVariant', '--text-tertiary': 'outline',
  '--divider': 'outlineVariant', '--outline': 'outline',
  '--danger': 'error', '--danger-bg': 'errorContainer',
  '--switch-track': 'outlineVariant', '--switch-thumb': 'onSurfaceVariant',
};
const ownedProperties = [...Object.keys(accentProperties), ...Object.keys(materialProperties), '--primary-hover', '--menu-pressed'];
const palettes = new Map();
let colorScheme;
let requestId = 0;
let refreshTimer;

export function parseManagerColors(css) {
  const colors = {};
  for (const match of css.matchAll(/--([A-Za-z]+)\s*:\s*(#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?)\s*;/g)) {
    if (!Object.hasOwn(roles, match[1])) continue;
    // CSS uses RRGGBBAA. Ignore transparent roles instead of misreading alpha.
    if (match[2].length === 9 && !match[2].toLowerCase().endsWith('ff')) continue;
    colors[match[1]] = match[2].slice(0, 7).toLowerCase();
  }
  return colors;
}

export function parseAndroidColors(output) {
  const colors = {};
  for (const line of output.split(/\r?\n/)) {
    const [role, ...parts] = line.split('=');
    if (!Object.hasOwn(roles, role)) continue;
    // `cmd overlay lookup` may return "@resource -> #AARRGGBB".
    const match = parts.join('=').trim().match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
    if (!match) continue;
    const value = match[1].toLowerCase();
    if (value.length === 8 && !value.startsWith('ff')) continue;
    colors[role] = `#${value.length === 8 ? value.slice(2) : value}`;
  }
  return colors;
}

function usable(colors, dark) {
  if (!required.every(role => colors[role])) return false;
  if (colors.background || colors.surface) {
    const value = colors.background || colors.surface;
    const rgb = [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16));
    const brightness = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    // A Manager palette can briefly lag behind a system appearance change.
    if ((brightness < 128) !== dark) return false;
  }
  return true;
}

async function managerColors(dark) {
  const abort = new AbortController();
  const timeout = window.setTimeout(() => abort.abort(), 1500);
  try {
    const response = await fetch('/internal/colors.css', { cache: 'no-store', signal: abort.signal });
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
  // Read resolved resources for the foreground Android user. This only looks
  // up colors; it never enables, disables, or creates a resource overlay.
  const mode = dark ? 'dark' : 'light';
  const lookups = Object.entries(roles).filter(([role]) => role !== 'background')
    .map(([role, resource]) => `${role}:system_${resource}_${mode}`).join(' ');
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
    const colors = parseAndroidColors(result.stdout || '');
    colors.background = colors.surface;
    return usable(colors, dark) ? colors : null;
  } catch (_) {
    return null;
  }
}

export function applySystemColors() {
  const root = document.documentElement;
  for (const property of ownedProperties) root.style.removeProperty(property);
  delete root.dataset.systemColors;
  if (!colorScheme) return;
  // Miuix keeps its established blue theme. Only Material 3 consumes the
  // Manager/Android Monet palette; both styles still follow light/dark CSS.
  if (!root.classList.contains('theme-md3')) return;
  const palette = palettes.get(colorScheme.matches);
  if (!palette) return;
  const properties = { ...accentProperties, ...materialProperties };
  for (const [property, role] of Object.entries(properties)) {
    if (palette.colors[role]) root.style.setProperty(property, palette.colors[role]);
  }
  root.style.setProperty('--primary-hover', 'color-mix(in srgb, var(--primary) 88%, var(--on-primary))');
  root.style.setProperty('--menu-pressed', 'color-mix(in srgb, var(--primary) 24%, var(--secondary-container))');
  root.dataset.systemColors = palette.source;
}

async function refreshSystemColors() {
  const id = ++requestId;
  const dark = colorScheme.matches;
  let colors = await managerColors(dark);
  let source = 'manager';
  if (id !== requestId) return;
  if (!colors) {
    colors = await androidColors(dark);
    source = 'android';
  }
  if (id !== requestId || dark !== colorScheme.matches) return;
  if (colors) palettes.set(dark, { colors, source });
  // A failed refresh retains a working palette for this appearance only.
  applySystemColors();
}

export function initSystemColors() {
  colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
  const schedule = () => {
    if (document.visibilityState === 'hidden') return;
    ++requestId; // Reject any response for the previous appearance immediately.
    applySystemColors();
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(refreshSystemColors, 150);
  };
  colorScheme.addEventListener('change', schedule);
  window.addEventListener('focus', schedule);
  // Initial navigation already starts a read below; only bfcache restores
  // need another pageshow read (avoids duplicate shell lookups at startup).
  window.addEventListener('pageshow', event => { if (event.persisted) schedule(); });
  document.addEventListener('visibilitychange', schedule);
  void refreshSystemColors();
}
