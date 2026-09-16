# App Systemizer（KernelSU）

App Systemizer 是一个 KernelSU 模块，通过 metamodule 的挂载机制把用户应用映射为系统应用。模块只写入 `/data/adb` 下的暂存目录和配置，不 remount 或修改真实的 `/system`、`super` 及动态逻辑分区。

## 工作方式

WebUI 读取用户应用，用户选择应用和目标目录后保存。模块复制 base APK 与 split APK 到模块数据目录，由 Magic Mount-rs 或其他兼容 metamodule 在重启后挂载到 `/system/app/<包名>/` 或 `/system/priv-app/<包名>/`。转换不会删除原用户应用或应用数据，也不会自动授予平台签名权限。

配置和诊断文件位于 `/data/adb/app-systemizer/`。取消选择并保存即可在下次重启时撤销对应挂载。`service.sh` 会在启动时检查并恢复缺失的暂存 APK。

## WebUI

- 顶栏标题为“系统应用转换”，默认使用 Material 3，日志默认关闭。
- Material 3 使用 KernelSU/Android 本机动态配色；Miuix 保留蓝色主题。两种风格自动跟随系统亮暗模式。
- Miuix 采用居中顶栏、独立圆角卡片、整行设置项和线性底栏图标；Material 3 保留其菜单、按钮和动态色层级。
- 应用页支持搜索、批量选择、`/system/app` 与 `/system/priv-app` 目录选择、保存和重启。下拉刷新应用与挂载状态，并保留未保存编辑。
- 日志页只有在“显示日志”开启后才记录内存日志；下拉只重新显示已收集日志，“刷新状态”按钮才查询挂载状态。
- 设置页保留下拉回弹动效，不显示刷新文字或执行刷新操作。三页手势均带阻尼、平滑回弹和减少动态效果支持。
- 主题选择、目录选择和页面交互支持触摸、键盘方向键及 Escape。

## 构建

需要 Node.js。安装依赖并打包：

    npm ci
    npm run package

`tools/build.mjs` 按 Asia/Shanghai 当天日期生成 `YYMMDD` 格式的 versionCode，并同步 `module.prop`、WebUI 版本信息和 `bundle.js`。模块版本格式为 `<语义版本>(<日期版本码>)`。

当前源码版本为 `1.2.8`；本次构建日期版本码由构建脚本生成。安装包输出到 `dist/App-Systemizer-KSU-v<版本>.zip`，模块文件位于 ZIP 根目录。

## 迁移说明

模块 id 为 `app-systemizer`，名称为 `App Systemizer`。新版本会优先使用新 id 的配置；如果没有，则迁移旧模块的选择清单、应用名称和暂存 APK，并禁用旧模块，避免重复挂载。旧 id 和旧 localStorage 键仅保留用于一次性兼容迁移。
