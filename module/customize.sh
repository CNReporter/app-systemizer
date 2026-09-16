#!/system/bin/sh
ui_print "*******************************"
module_name=$(sed -n 's/^name=//p' "$MODPATH/module.prop" | tr -d '\r')
module_version=$(sed -n 's/^version=//p' "$MODPATH/module.prop" | tr -d '\r')
ui_print "  $module_name $module_version"
ui_print "*******************************"
ui_print "This module never writes to /system."
ui_print "Requires a mounting metamodule (Magic Mount-rs recommended)."
ui_print "Selections made in WebUI apply after the next reboot."
if [ "${API:-0}" -lt 37 ]; then
  ui_print "! This build is designed and tested for Android 17 (API 37)."
fi
MODULE_ID=$(sed -n 's/^id=//p' "$MODPATH/module.prop" | tr -d '\r')
DATA_DIR="/data/adb/$MODULE_ID"
# This identifier is retained only to migrate installations of the old name.
LEGACY_MODULE_ID=system-app-promoter
mkdir -p "$MODPATH/system/app" "$MODPATH/system/priv-app" "$DATA_DIR/config" || abort "Cannot prepare module directories."
chmod 0755 "$MODPATH/scripts/app-systemizer.sh" "$MODPATH/service.sh"

# Prefer the current installation, including an empty selection after clearing.
# Copy old-name state only on the first install under the new id.
source_id="$MODULE_ID"
if [ ! -f "$DATA_DIR/config/selections.tsv" ]; then
  for config_source in "/data/adb/modules/$MODULE_ID/config" "/data/adb/$LEGACY_MODULE_ID/config" "/data/adb/modules/$LEGACY_MODULE_ID/config"; do
    if [ -f "$config_source/selections.tsv" ]; then
      cp -af "$config_source/." "$DATA_DIR/config/" || abort "Cannot preserve saved selections."
      case "$config_source" in
        "/data/adb/$LEGACY_MODULE_ID/config"|"/data/adb/modules/$LEGACY_MODULE_ID/config") source_id="$LEGACY_MODULE_ID" ;;
      esac
      break
    fi
  done
fi

live="/data/adb/modules/$source_id"
source_system="$live/system"
if [ -f /data/adb/metamodule/module.prop ] && grep -qx 'id=meta-overlayfs' /data/adb/metamodule/module.prop \
  && [ -d "/data/adb/metamodule/mnt/$source_id/system" ]; then
  source_system="/data/adb/metamodule/mnt/$source_id/system"
fi
if [ "$source_system" != "$MODPATH/system" ]; then
  for part in app priv-app; do
    if [ -d "$source_system/$part" ]; then
      cp -af "$source_system/$part/." "$MODPATH/system/$part/" || abort "Cannot preserve staged APKs."
    fi
  done
fi

# Prepare content and contexts before the next boot's mounting/scanning phase.
"$MODPATH/scripts/app-systemizer.sh" describe >/dev/null 2>&1 || abort "Cannot prepare saved applications."
"$MODPATH/scripts/app-systemizer.sh" fixctx >/dev/null 2>&1 || abort "Cannot prepare file contexts."
# A changed id is a separate KernelSU module. Disable the previous id after
# copying succeeds so both modules cannot mount the same package on next boot.
for legacy_module in "/data/adb/modules/$LEGACY_MODULE_ID" "/data/adb/modules_update/$LEGACY_MODULE_ID"; do
  if [ -d "$legacy_module" ]; then
    touch "$legacy_module/disable" || abort "Cannot disable the previous module."
    ui_print "Previous module disabled; its data has been retained."
  fi
done
ui_print "Saved selections are preserved across module updates."
