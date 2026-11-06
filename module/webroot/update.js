// 在线检查更新：读取仓库最新 Release，和本地版本比较。
// GitHub 的 API 带 CORS 头，WebView 里可以直接 fetch；60 次/小时的匿名额度对
// 每天一次的检查足够了。
const API = 'https://api.github.com/repos/CNReporter/app-systemizer/releases/latest';
const RELEASES = 'https://github.com/CNReporter/app-systemizer/releases';

/** 取出 x.y.z 三段数字，失败返回 null。 */
export function parseVersion(value) {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(String(value == null ? '' : value));
  return match ? match.slice(1).map(Number) : null;
}

/** a > b 返回 1，相等 0，a < b 返回 -1；任一方无法解析按相等处理。 */
export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  }
  return 0;
}

export async function fetchLatest() {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(API, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const version = String(data.tag_name || '').replace(/^v/i, '');
    if (!parseVersion(version)) throw new Error('无法解析版本号');
    return {
      version,
      url: data.html_url || RELEASES,
      notes: String(data.body || '').trim(),
      publishedAt: data.published_at || '',
    };
  } finally {
    window.clearTimeout(timer);
  }
}

export function readCache(storageKey) {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!raw || typeof raw.at !== 'number' || !raw.latest) return null;
    if (!parseVersion(raw.latest.version)) return null;
    return raw;
  } catch (_) {
    return null;
  }
}

export function writeCache(storageKey, latest) {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ at: Date.now(), latest }));
  } catch (_) { /* 存不下就算了，下次重新请求 */ }
}

export function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
