#!/system/bin/sh
# Runs on every boot:
# 1. rescue legacy config stored inside the old module directory (1.0.x);
# 2. restore lost staged APKs from the saved selection if they went missing;
# 3. guarantee the whole staged tree carries system_file so the mounted
#    content is actually scanned by Package Manager;
# 4. keep the Manager list description showing software names:
#    通过挂载机制将选定应用转为系统应用。当前已挂载:[微信, QQ]。

MODDIR=$(CDPATH= cd -- "${0%/*}" && pwd)
MODULE_ID=${MODDIR##*/}
DATA_DIR="/data/adb/$MODULE_ID"
STATE_FILE="$DATA_DIR/config/selections.tsv"
LABELS_FILE="$DATA_DIR/config/labels.tsv"

sync_description() {
  mounted_names=""
  if [ -s "$LABELS_FILE" ]; then
    while IFS='	' read -r pkg label _extra; do
      [ -n "$label" ] || continue
      label=$(printf '%s' "$label" | tr '\r\n\t' '   ')
      [ -n "$label" ] || continue
      if [ -n "$mounted_names" ]; then
        mounted_names="$mounted_names, $label"
      else
        mounted_names="$label"
      fi
    done < "$LABELS_FILE"
  fi
  # Fallback for installs saved before labels existed: show package names
  # rather than leaving the list silently empty.
  if [ -z "$mounted_names" ] && [ -s "$STATE_FILE" ]; then
    while IFS='|' read -r pkg _target _rest; do
      [ -n "$pkg" ] || continue
      case "$pkg" in ''|*[!A-Za-z0-9._]*) continue ;; esac
      if [ -n "$mounted_names" ]; then
        mounted_names="$mounted_names, $pkg"
      else
        mounted_names="$pkg"
      fi
    done < "$STATE_FILE"
  fi
  description="通过挂载机制将选定应用转为系统应用。当前已挂载:[$mounted_names]。"
  ksu_bin=$(command -v ksud 2>/dev/null)
  [ -n "$ksu_bin" ] || ksu_bin=/data/adb/ksu/bin/ksud
  if [ -x "$ksu_bin" ]; then
    KSU_MODULE="$MODULE_ID" "$ksu_bin" module config set override.description "$description" >/dev/null 2>&1 || true
  fi
}

{
  # service.sh runs in background; wait briefly so ksud is ready, then heal
  # the staged content, fix the SELinux contexts, and refresh the description.
  for _i in 1 2 3 4 5 6 7 8 9 10; do
    if [ -x /data/adb/ksu/bin/ksud ] || command -v ksud >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  if [ -x "$MODDIR/scripts/app-systemizer.sh" ]; then
    MODDIR="$MODDIR" "$MODDIR/scripts/app-systemizer.sh" restage >/dev/null 2>&1 || true
    MODDIR="$MODDIR" "$MODDIR/scripts/app-systemizer.sh" fixctx >/dev/null 2>&1 || true
  fi
  sync_description
} &
