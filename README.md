# App Systemizer（KernelSU）

把普通用户应用变成系统应用：勾选、保存、重启，之后它就以 `/system/app/<包名>/` 或 `/system/priv-app/<包名>/` 的身份运行。

模块只往 `/data/adb` 写暂存文件和配置，不 remount、不改真实分区、不删应用数据，也不会授予平台签名权限。取消勾选并保存，下次重启就撤销。

## 功能

- **应用页**：搜索、批量选择、切换目标目录，保存后重启生效；下拉刷新应用列表与挂载状态。
- **日志页**：滚动记录命令输出，可按 OK / 信息 / 警告 / 错误筛选；默认关闭，在设置里开启后才出现。
- **设置页**：自定义主题色、日志开关、检查更新、模块信息。
- **Material 3 界面**：跟随系统深浅色，并读取 KernelSU / Android 的动态取色；没有动态取色时回落到 M3 基线色板。
- **主题色**：设置 → 外观 → 主题色，输入六位色号或选预设，整套界面按这颗种子色重新派生。
- **检查更新**：`module.prop` 里带 `updateJson`，每次发版会把 `update.json` 作为 Release 附件上传；KernelSU 管理器据此在模块卡片右下角（卸载按钮左边）显示更新按钮，点一下直接升级。

## 工作方式

保存时，WebUI 把所选应用的 base APK 与 split APK 复制到模块数据目录，并把选择写进 `config/selections.tsv`；重启后由 Magic Mount-rs（或其他兼容 metamodule）把这些目录绑定到系统分区。`service.sh` 会在开机时检查并恢复缺失的暂存 APK。

所有配置和诊断文件都在 `/data/adb/app-systemizer/`。

## 安装

1. 安装并启用 Magic Mount-rs（或其他兼容 metamodule）。
2. 在 KernelSU / SukiSU Ultra / Magisk 里刷入 `App-Systemizer-KSU-vX.Y.Z.zip`，重启。
3. 从模块详情页打开 WebUI。

没有挂载元模块时 WebUI 会直接提示，转换不会生效。

## 使用

应用页顶部的分段按钮决定**之后新勾选**的应用放进哪个目录，已有选择保留各自的目标；右下角的保存按钮只在有未保存修改时出现。日志默认不记录，需要先在设置里打开「显示日志」。

## 兼容性

只在作者的两台 Android 17 / HyperOS 4 设备上测试过，推荐使用 ReSukiSU 和 SukiSU。其他 KernelSU 分支或 Android 版本未验证。

## 开发

    npm ci
    npm run build     # 打包 bundle，并把版本写进 module.prop 与 module-info.json
    npm run package   # 生成 dist/App-Systemizer-KSU-v<version>.zip

版本号只在 `package.json` 维护（SemVer）；`versionCode` 由 `MAJOR×1000000 + MINOR×1000 + PATCH` 换算，安装器靠它判断升级。

发版是 tag 驱动的：改 `package.json` 的版本 → 在 `CHANGELOG.md` 写一节 `## <version>` → 提交 → 打 tag `v<version>` 并推送。`.github/workflows/release.yml` 会校验 tag 与版本一致，构建 zip，用 CHANGELOG 对应小节当正文创建 Release，同时生成 `update.json`（version / versionCode / zipUrl / changelog）一并上传，供管理器检查更新。

## 目录

    module/            模块本体：module.prop、service.sh、controller 脚本、webroot
    module/webroot/    WebUI：index.html、app.css、app.js、theme.js、update.js
    tools/             build.mjs（打包 bundle）、package.mjs（生成 zip）
    .github/workflows/ tag 触发的发版流程
