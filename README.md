# App Systemizer（KernelSU）

App Systemizer 是一个 KernelSU 模块，通过 metamodule 的挂载机制把用户应用映射为系统应用。模块只写入 `/data/adb` 下的暂存目录和配置，不 remount 或修改真实的 `/system`、`super` 及动态逻辑分区。

## 工作方式

WebUI 读取用户应用，用户选择应用和目标目录后保存。模块复制 base APK 与 split APK 到模块数据目录，由 Magic Mount-rs 或其他兼容 metamodule 在重启后挂载到 `/system/app/<包名>/` 或 `/system/priv-app/<包名>/`。转换不会删除原用户应用或应用数据，也不会自动授予平台签名权限。

配置和诊断文件位于 `/data/adb/app-systemizer/`。取消选择并保存即可在下次重启时撤销对应挂载。`service.sh` 会在启动时检查并恢复缺失的暂存 APK。

## WebUI

- 顶栏标题为“系统应用转换”，默认使用 Material 3，日志默认关闭。
- 设置页的“UI 风格”可在 Material 3 与 Miuix 之间切换，选择会持久保存。两套风格都跟随系统亮暗模式，并读取 KernelSU/Android 的动态取色：Material 3 套用完整调色板，Miuix 只借用强调色，保留 HyperOS 的中性表面、圆角和字体层级。
- Material 3 使用分区卡片、药丸形分段控件和带指示器的底栏；Miuix 使用通栏分组卡片、行内分隔线、行尾圆形勾选和纯色底栏。
- 应用页支持搜索、批量选择、`/system/app` 与 `/system/priv-app` 目录选择、保存和重启。下拉刷新应用与挂载状态，并保留未保存编辑。
- 日志页只有在“显示日志”开启后才记录内存日志；下拉只重新显示已收集日志，“刷新状态”按钮才查询挂载状态。
- 设置页保留下拉回弹动效，不显示刷新文字或执行刷新操作。三页手势均带阻尼、平滑回弹和减少动态效果支持。
- 主题选择、目录选择和页面交互支持触摸、键盘方向键及 Escape；应用行暴露 `checkbox` 语义，选中状态与锁定状态对读屏可见。

## 构建

需要 Node.js。安装依赖并打包：

    npm ci
    npm run package

## 版本号

`module.prop` 里的 `version` 使用[语义化版本](https://semver.org/lang/zh-CN/) `MAJOR.MINOR.PATCH`，例如 `1.3.2`，只需要在 `package.json` 里维护。

`versionCode` 由版本号换算，不含日期：`MAJOR × 1 000 000 + MINOR × 1 000 + PATCH`，所以 `1.3.2` 对应 `1003002`。每个分段占三位，`MINOR` 与 `PATCH` 需小于 1000；版本号升一级，`versionCode` 必然跟着变大，安装器的升级判断与版本号完全一致。

发版只改 `package.json` 的版本号再执行 `npm run package`，`module.prop`、`webroot/module-info.json` 和 `dist/` 里的 ZIP 文件名会一起更新。

## PS
仅在本人两部 Android 17的 HyperOS 4设备上测试，推荐使用 ReSukiSU。
