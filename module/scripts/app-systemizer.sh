#!/system/bin/sh
# Persistent controller. Selections and labels live in /data/adb/<module_id>/
# so they survive module updates; staged APKs live in the module's system
# directory, which service.sh re-materializes from the saved list if it ever
# goes missing. The active metamodule (Magic Mount-rs recommended) bind-mounts
# that system directory onto the real /system at boot.

MODDIR=$(CDPATH= cd -- "${0%/*}/.." && pwd)
MODULE_ID=${MODDIR##*/}
DATA_DIR="/data/adb/$MODULE_ID"
CONFIG_DIR="$DATA_DIR/config"
STATE_FILE="$CONFIG_DIR/selections.tsv"
LABELS_FILE="$CONFIG_DIR/labels.tsv"
LOG_FILE="$CONFIG_DIR/last-operation.log"
ERROR_LOG="$CONFIG_DIR/last-error.log"
WORK_DIR="$DATA_DIR/.app-systemizer-stage"
DIAG_FILE=""
# meta-overlayfs keeps module content in its own ext4 image. Magic Mount-rs and
# other bind-mount metamodules consume the regular module directory.
SYSTEM_DIR="$MODDIR/system"
if [ -f /data/adb/metamodule/module.prop ] \
  && grep -qx 'id=meta-overlayfs' /data/adb/metamodule/module.prop \
  && [ -d /data/adb/metamodule/mnt ]; then
  SYSTEM_DIR="/data/adb/metamodule/mnt/$MODULE_ID/system"
fi
umask 022

say() { printf '%s\n' "$*"; }
say_err() { printf '%s\n' "$*" >&2; }
die() { say_err "ERROR: $*"; exit 1; }
diag() {
  if [ -n "$DIAG_FILE" ]; then printf '%s\n' "$*" >> "$DIAG_FILE"; fi
  return 0
}
is_valid_package() { case "$1" in ''|*[!A-Za-z0-9._]*) return 1 ;; *) return 0 ;; esac; }
is_valid_target() { [ "$1" = "app" ] || [ "$1" = "priv-app" ]; }

migrate_legacy_data() {
  # 1.0.x kept config inside the module directory; move it out so module
  # updates can never wipe the saved selections again.
  mkdir -p "$CONFIG_DIR" 2>/dev/null
  if [ -d "$MODDIR/config" ]; then
    cp -af "$MODDIR/config/." "$CONFIG_DIR/" 2>/dev/null
    rm -rf "$MODDIR/config"
  fi
  # During a Manager update MODDIR points at modules_update/<id>, while the
  # live data is still under /data/adb/modules/<id> (it gets wiped on the
  # next reboot merge). Rescue selections AND already-staged APKs from there
  # so the update itself heals instead of wiping.
  live="/data/adb/modules/$MODULE_ID"
  if [ "$MODDIR" != "$live" ] && [ -d "$live" ]; then
    if [ ! -s "$STATE_FILE" ]; then
      cp -af "$live/config/selections.tsv" "$STATE_FILE" 2>/dev/null
      cp -af "$live/config/labels.tsv" "$LABELS_FILE" 2>/dev/null
    fi
    for part in app priv-app; do
      if [ -d "$live/system/$part" ] && [ ! -d "$SYSTEM_DIR/$part" ]; then
        mkdir -p "$SYSTEM_DIR/$part" 2>/dev/null
        cp -af "$live/system/$part/." "$SYSTEM_DIR/$part/" 2>/dev/null
      fi
    done
  fi
}

fix_contexts() {
  # Staging happens in DATA_DIR whose default SELinux context differs from the
  # module directory. A rename (mv) carries the source context along, and only
  # fixing the APK files is not enough: Package Manager also checks the
  # directories. Without system_file on every dir, the mounted content exists
  # but is silently ignored, so the app never becomes a system app.
  [ -d "$SYSTEM_DIR" ] || return 0
  find "$SYSTEM_DIR" -type d -exec chmod 0755 {} + 2>/dev/null
  find "$SYSTEM_DIR" -type f -name '*.apk' -exec chmod 0644 {} + 2>/dev/null
  find "$SYSTEM_DIR" -exec chcon u:object_r:system_file:s0 {} + 2>/dev/null || true
  return 0
}

set_module_description() {
  description="$1"
  ksu_bin=$(command -v ksud 2>/dev/null)
  [ -n "$ksu_bin" ] || ksu_bin=/data/adb/ksu/bin/ksud
  if [ -x "$ksu_bin" ]; then
    KSU_MODULE="$MODULE_ID" "$ksu_bin" module config set override.description "$description" >/dev/null 2>&1 \
      || say_err "WARNING: description status could not be updated."
  else
    say_err "WARNING: ksud command is unavailable; description status could not be updated."
  fi
}

prop_value() { sed -n "s/^$2=//p" "$1" 2>/dev/null | head -n 1 | tr -d '\r'; }

# A bind mount shares the inode of the mounted file, so comparing a staged APK
# against its /system counterpart proves the mount regardless of how a given
# metamodule happens to format /proc/mounts.
mount_verified() {
  sample=$(find "$SYSTEM_DIR/app" "$SYSTEM_DIR/priv-app" -type f -name '*.apk' 2>/dev/null | head -n 1)
  [ -n "$sample" ] || return 1
  rel=${sample#"$SYSTEM_DIR"/}
  [ -e "/system/$rel" ] || return 1
  staged_ino=$(stat -c %i "$sample" 2>/dev/null)
  system_ino=$(stat -c %i "/system/$rel" 2>/dev/null)
  if [ -n "$staged_ino" ] && [ "$staged_ino" = "$system_ino" ]; then
    return 0
  fi
  return 1
}

print_status() {
  migrate_legacy_data
  say "MODULE_ID=$MODULE_ID"
  say "DATA_DIR=$DATA_DIR"
  say "SYSTEM_DIR=$SYSTEM_DIR"
  if [ -L /data/adb/metamodule ] && [ -f /data/adb/metamodule/module.prop ]; then
    say "METAMODULE=active"
    say "METAMODULE_ID=$(prop_value /data/adb/metamodule/module.prop id)"
  else
    say "METAMODULE=missing"
  fi
  # Magic Mount-rs bind-mounts this module's system subdirectories onto
  # /system; an overlay /system means an OverlayFS-style metamodule. The inode
  # check is the reliable signal, the greps are the cheap fallback.
  if mount_verified \
    || grep -Fq "$SYSTEM_DIR" /proc/mounts 2>/dev/null \
    || grep -q ' /system .*overlay' /proc/mounts 2>/dev/null; then
    say "SYSTEM_MOUNT=active"
  else
    say "SYSTEM_MOUNT=inactive"
  fi
  staged_apks=0
  mounted_apps=0
  if [ -d "$SYSTEM_DIR" ]; then
    staged_apks=$(find "$SYSTEM_DIR/app" "$SYSTEM_DIR/priv-app" -type f -name '*.apk' 2>/dev/null | wc -l)
    mounted_apps=$(find "$SYSTEM_DIR/app" "$SYSTEM_DIR/priv-app" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
  fi
  say "MOUNTED_APPS=$mounted_apps"
  say "STAGED_APKS=$staged_apks"
  # The system tree is bind-mounted at boot, so a selections file written after
  # this boot is not in effect yet. Comparing its mtime with the kernel boot
  # time lets the WebUI say "已生效" instead of always claiming "重启后生效".
  pending_reboot=0
  boot_time=$(sed -n 's/^btime //p' /proc/stat 2>/dev/null | head -n 1)
  if [ -s "$STATE_FILE" ] && [ -n "$boot_time" ]; then
    state_mtime=$(stat -c %Y "$STATE_FILE" 2>/dev/null || echo 0)
    case "$state_mtime" in ''|*[!0-9]*) state_mtime=0 ;; esac
    if [ "$state_mtime" -gt "$boot_time" ]; then
      pending_reboot=1
    fi
  fi
  say "PENDING_REBOOT=$pending_reboot"
  say "Configured selections:"
  if [ -s "$STATE_FILE" ]; then sed 's/|/ -> system\//g' "$STATE_FILE"; else say "(none)"; fi
}

export_state() { migrate_legacy_data; [ -f "$STATE_FILE" ] && cat "$STATE_FILE"; }

apk_lines() {
  # stdin: raw Package Manager output -> stdout: absolute .apk paths only.
  # Accepts both `package:/data/...` and bare `/data/...` shapes because OEM
  # builds and newer Android revisions differ here.
  tr -d '\r' | sed 's/^package://' | grep '^/' | grep '\.apk'
}

resolve_apks() {
  # Print absolute APK paths on stdout. Every attempt is recorded in DIAG_FILE
  # so a failure can be explained instead of guessed at.
  pkg="$1"
  pm_bin=$(command -v pm 2>/dev/null)
  [ -n "$pm_bin" ] || pm_bin=/system/bin/pm
  found=""
  if [ -x "$pm_bin" ]; then
    raw=$("$pm_bin" path "$pkg" 2>&1)
    diag "[$pkg] $pm_bin path => ${raw:-<空输出>}"
    found=$(printf '%s\n' "$raw" | apk_lines)
  else
    diag "[$pkg] 找不到 pm（$pm_bin）"
  fi
  if [ -z "$found" ]; then
    raw=$("$pm_bin" path --user 0 "$pkg" 2>&1)
    diag "[$pkg] $pm_bin path --user 0 => ${raw:-<空输出>}"
    found=$(printf '%s\n' "$raw" | apk_lines)
  fi
  if [ -z "$found" ] && [ -x /system/bin/cmd ]; then
    raw=$(/system/bin/cmd package path "$pkg" 2>&1)
    diag "[$pkg] cmd package path => ${raw:-<空输出>}"
    found=$(printf '%s\n' "$raw" | apk_lines)
  fi
  if [ -z "$found" ]; then
    # `pm list packages -f` prints `package:/path/base.apk=<pkg>`; the path is
    # between the first colon and the trailing `=package`.
    raw=$("$pm_bin" list packages -f "$pkg" 2>&1)
    diag "[$pkg] pm list packages -f => ${raw:-<空输出>}"
    found=$(printf '%s\n' "$raw" | tr -d '\r' | sed -n "s|^package:\(/[^=]*\.apk\)=${pkg}\$|\1|p")
  fi
  if [ -z "$found" ]; then
    # Last resort: scan the install locations directly. Covers promoted apps
    # whose Package Manager entry now points at /system as well as broken pm.
    diag "[$pkg] 回退到文件系统扫描"
    for dir in /data/app/"$pkg"-* /data/app/*/"$pkg"-*; do
      [ -d "$dir" ] || continue
      found="$found
$(find "$dir" -maxdepth 1 -type f -name '*.apk' 2>/dev/null)"
    done
    for base in "$SYSTEM_DIR/app" "$SYSTEM_DIR/priv-app" /system/app /system/priv-app /system_ext/app /system_ext/priv-app /product/app /product/priv-app /oem/app /oem/priv-app /odm/app; do
      [ -d "$base/$pkg" ] || continue
      found="$found
$(find "$base/$pkg" -maxdepth 1 -type f -name '*.apk' 2>/dev/null)"
    done
    found=$(printf '%s\n' "$found" | grep '^/' 2>/dev/null)
  fi
  [ -n "$found" ] || return 1
  printf '%s\n' "$found" | grep '^/' | sort -u
}

stage_apks() {
  # stage_apks <package> <target> <destination>
  package="$1"; target="$2"; dest="$3"
  list="$WORK_DIR/apks.list"
  : > "$list"
  resolve_apks "$package" > "$list" 2>/dev/null
  if [ ! -s "$list" ]; then
    say_err "无法定位 $package 的 APK（详见诊断日志）"
    return 1
  fi
  mkdir -p "$dest" || { say_err "无法创建暂存目录：$dest"; return 1; }
  copied=0
  while IFS= read -r apk; do
    [ -n "$apk" ] || continue
    filename=${apk##*/}
    [ "$dest/$filename" = "$apk" ] && { copied=$((copied + 1)); continue; }
    if [ ! -r "$apk" ]; then
      say_err "APK 不可读：$apk"
      rm -rf "$dest"
      return 1
    fi
    cp -f "$apk" "$dest/$filename" || { say_err "复制失败：$apk"; rm -rf "$dest"; return 1; }
    chmod 0644 "$dest/$filename"
    chcon u:object_r:system_file:s0 "$dest/$filename" 2>/dev/null || true
    copied=$((copied + 1))
  done < "$list"
  if [ "$copied" -eq 0 ]; then
    say_err "没有可复制的 APK 文件"
    rm -rf "$dest"
    return 1
  fi
  return 0
}

restage_missing() {
  # Self-heal: if the staged system content was wiped (module update flash,
  # interrupted install, manual cleanup) but the saved list survived, re-copy
  # the APKs of every still-installed package. Newly copied files take effect
  # on the following boot.
  migrate_legacy_data
  [ -s "$STATE_FILE" ] || return 0
  mkdir -p "$WORK_DIR" "$SYSTEM_DIR/app" "$SYSTEM_DIR/priv-app" 2>/dev/null
  DIAG_FILE="$WORK_DIR/diag.log"
  : > "$DIAG_FILE"
  restaged=0
  while IFS='|' read -r package target _rest; do
    [ -n "$package" ] || continue
    is_valid_package "$package" || continue
    is_valid_target "$target" || continue
    dest="$SYSTEM_DIR/$target/$package"
    [ -d "$dest" ] && continue
    if stage_apks "$package" "$target" "$dest" 2>/dev/null; then
      restaged=$((restaged + 1))
    else
      rm -rf "$dest"
    fi
  done < "$STATE_FILE"
  if [ -s "$DIAG_FILE" ]; then cp -f "$DIAG_FILE" "$CONFIG_DIR/last-restage-diag.log" 2>/dev/null; fi
  rm -rf "$WORK_DIR"
  # Staged copies may carry the wrong context after a rescue copy; normalize
  # the whole tree so the next boot's mount is scannable.
  [ "$restaged" -gt 0 ] && fix_contexts
  [ "$restaged" -gt 0 ] && say "Restaged $restaged app(s) from the saved selection."
  return 0
}

apply_state() {
  [ "$(id -u)" = "0" ] || die "需要 Root 权限。"
  [ $# -eq 1 ] || die "内部请求错误。"
  migrate_legacy_data
  mkdir -p "$CONFIG_DIR" || die "无法创建数据目录：$CONFIG_DIR"
  mkdir -p "$SYSTEM_DIR" || die "无法访问暂存目录：$SYSTEM_DIR"
  input="$WORK_DIR.input"
  rm -rf "$WORK_DIR" "$input"
  mkdir -p "$WORK_DIR/system/app" "$WORK_DIR/system/priv-app" || die "无法创建暂存区。"
  DIAG_FILE="$WORK_DIR/diag.log"
  : > "$DIAG_FILE"
  printf '%s' "$1" | base64 -d > "$input" 2>/dev/null || die "选择数据格式无效（base64 解码失败）。"
  tr -d '\r' < "$input" > "$input.clean" && mv "$input.clean" "$input"
  if [ ! -s "$input" ]; then
    # An empty payload means the user cleared every selection: still valid,
    # just activate empty directories below.
    :
  fi
  : > "$WORK_DIR/selections.tsv"
  : > "$WORK_DIR/labels.tsv"
  mounted_names=""
  failures=""
  while IFS='|' read -r package target label64 extra; do
    [ -z "$package$target$label64$extra" ] && continue
    is_valid_package "$package" || { failures="$failures
$package：包名不合法"; continue; }
    is_valid_target "$target" || { failures="$failures
$package：目标目录不合法（$target）"; continue; }
    [ -z "$extra" ] || { failures="$failures
$package：选择数据不完整"; continue; }
    display_name=$(printf '%s' "$label64" | base64 -d 2>/dev/null | tr '\r\n\t' '   ' | cut -c1-80)
    [ -n "$display_name" ] || display_name="$package"
    stage_err="$WORK_DIR/stage.err"
    : > "$stage_err"
    if ! stage_apks "$package" "$target" "$WORK_DIR/system/$target/$package" 2>"$stage_err"; then
      reason=$(head -n 1 "$stage_err" 2>/dev/null)
      [ -n "$reason" ] || reason="未知错误"
      failures="$failures
$display_name（$package）：$reason"
      continue
    fi
    printf '%s|%s\n' "$package" "$target" >> "$WORK_DIR/selections.tsv"
    printf '%s\t%s\n' "$package" "$display_name" >> "$WORK_DIR/labels.tsv"
    if [ -n "$mounted_names" ]; then mounted_names="$mounted_names, $display_name"; else mounted_names="$display_name"; fi
  done < "$input"
  if [ -n "$failures" ]; then
    {
      printf '=== %s ===\n' "$(date '+%Y-%m-%d %H:%M:%S %z')"
      printf 'failures:%s\n' "$failures"
      printf '--- diagnostics ---\n'
      cat "$DIAG_FILE" 2>/dev/null
    } > "$ERROR_LOG" 2>/dev/null
    tail_out=$(tail -n 6 "$DIAG_FILE" 2>/dev/null | tr '\n' '；')
    rm -rf "$WORK_DIR" "$input"
    die "以下应用无法转为系统应用：$failures
诊断：${tail_out:-无}"
  fi
  rm -rf "$SYSTEM_DIR/app" "$SYSTEM_DIR/priv-app"
  mkdir -p "$SYSTEM_DIR" || die "无法准备模块 system 目录。"
  mv "$WORK_DIR/system/app" "$SYSTEM_DIR/app" || die "无法启用 /system/app 暂存数据。"
  mv "$WORK_DIR/system/priv-app" "$SYSTEM_DIR/priv-app" || die "无法启用 /system/priv-app 暂存数据。"
  # Everything staged under DATA_DIR inherits its SELinux context; crossing the
  # volume into the module directory via mv preserves it. Restore the whole
  # staged tree (dirs *and* files) to system_file so PackageManager's scan
  # accepts the content after reboot.
  fix_contexts
  mv "$WORK_DIR/selections.tsv" "$STATE_FILE" || die "无法保存选择清单。"
  mv "$WORK_DIR/labels.tsv" "$LABELS_FILE" || die "无法保存应用名称。"
  rm -rf "$WORK_DIR" "$input"
  rm -f "$ERROR_LOG" 2>/dev/null
  staged_apks=$(find "$SYSTEM_DIR/app" "$SYSTEM_DIR/priv-app" -type f -name '*.apk' 2>/dev/null | wc -l)
  staged_apps=$(find "$SYSTEM_DIR/app" "$SYSTEM_DIR/priv-app" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
  { date '+%Y-%m-%d %H:%M:%S %z'; say "Saved $(wc -l < "$STATE_FILE") selection(s). Reboot required."; } > "$LOG_FILE"
  set_module_description "通过挂载机制将选定应用转为系统应用。当前已挂载:[$mounted_names]。"
  say "OK: $staged_apps app(s) / $staged_apks APK file(s) staged in $SYSTEM_DIR. Reboot to apply the updated system mapping."
}

probe_package() {
  [ -n "$1" ] || die "Usage: $0 probe <package>"
  migrate_legacy_data
  mkdir -p "$WORK_DIR" 2>/dev/null
  DIAG_FILE="$WORK_DIR/diag.log"
  : > "$DIAG_FILE"
  say "PACKAGE=$1"
  say "SYSTEM_DIR=$SYSTEM_DIR"
  say "resolved:"
  resolve_apks "$1" | sed 's/^/  /'
  say "diagnostics:"
  sed 's/^/  /' "$DIAG_FILE" 2>/dev/null
  rm -rf "$WORK_DIR"
}

case "$1" in
  apply) shift; apply_state "$@" ;;
  export) export_state ;;
  status) print_status ;;
  restage) restage_missing ;;
  fixctx) migrate_legacy_data; fix_contexts ;;
  describe) restage_missing >/dev/null; print_status >/dev/null ;;
  probe) shift; probe_package "$@" ;;
  *) die "Usage: $0 {apply <base64>|export|status|restage|fixctx|describe|probe <package>}" ;;
esac
