# App Systemizer（KernelSU）

App Systemizer 是一个 KernelSU 模块，通过 metamodule 的挂载机制把用户应用映射为系统应用。模块只写入 `/data/adb` 下的暂存目录和配置，不 remount 或修改真实的 `/system`、`super` 及动态逻辑分区。

## 工作方式

WebUI 读取用户应用，用户选择应用和目标目录后保存。模块复制 base APK 与 split APK 到模块数据目录，由 Magic Mount-rs 或其他兼容 metamodule 在重启后挂载到 `/system/app/<包名>/` 或 `/system/priv-app/<包名>/`。转换不会删除原用户应用或应用数据，也不会自动授予平台签名权限。

配置和诊断文件位于 `/data/adb/app-systemizer/`。取消选择并保存即可在下次重启时撤销对应挂载。`service.sh` 会在启动时检查并恢复缺失的暂存 APK。

## WebUI

- 只有一套 Material 3 主题：跟随系统深浅色，并读取 KernelSU/Android 的动态取色写入 `--sys-*`。
- 设置 → 外观 → 主题色可以自定义主色：直接输入六位十六进制色号，或从预设色里选一个；界面会用这颗种子色派生容器色、次级色和表面层级，选「使用系统取色」随时退回动态取色。选择保存在 `localStorage`，下次打开仍然生效。
- 组件按 M3 规范实现：大标题应用栏、填充卡片、搜索栏、分段按钮、带指示器的底部导航、扩展 FAB、开关、底部面板和对话框；页面底纹、卡片同心圆与徽章光环都由当前主色派生。
- 顶栏标题随页签变化（系统应用转换 / 运行日志 / 设置），日志默认关闭。
- 应用页支持搜索、批量选择、`/system/app` 与 `/system/priv-app` 分段切换、保存和重启。目标目录只影响之后勾选的应用；保存动作是右下角扩展 FAB，只在存在未保存修改时出现。下拉刷新应用与挂载状态，并保留未保存编辑。
- 日志页默认不显示；在设置中开启“显示日志”后才会出现在底部导航并记录内存日志。下拉只重新显示已收集日志，“刷新状态”按钮才查询挂载状态。
- 设置页保留下拉回弹动效，不执行刷新操作。三页手势均带阻尼、平滑回弹和减少动态效果支持。
- 分段按钮、搜索和页面交互支持触摸与键盘方向键；应用行暴露 `checkbox` 语义，选中状态与锁定状态对读屏可见。

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
