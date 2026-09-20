# 待办与工作记录 Pro 独立绿色版

Windows x64 免安装桌面工具，版本 **1.0.0**。不依赖 Sapphire、Node.js 或浏览器安装。此分支为 `standalone-portable`，原 Sapphire 组件分支保持独立。

## 功能

- 待办新增、编辑、优先级、标签、子任务、重复任务、筛选与拖动排序。
- 独立工作记录、关联待办工作项，以及实际完成时间展示。
- 独立工作月历、标题换行、日期格内滚动。
- 双周报 TXT 导出，可选择本周为第一周或第二周，也可自选日期范围。
- JSON 备份导入导出、月份 CSV 导出、页面内日期时间选择器。

## 安装

将绿色版 ZIP 完整解压到有写权限的文件夹，双击 `TodoWorklogPro.exe`。不要只移动 EXE，旁边的运行库和 resources 目录必须一同保留。程序未购买代码签名证书，Windows 可能显示未知发布者。

数据保存在 EXE 同目录的 `data/state.json`，上一份数据备份为 `data/state.backup.json`，运行缓存位于 `data/runtime/`。迁移时退出程序并复制整个工具目录。数据损坏时程序会报错并停止，不会默默清空；先另行备份 data，再将 state.backup.json 复制为 state.json 后重试。

菜单“文件 → 打开数据目录”可定位数据；主窗口关闭即退出，月历可单独关闭重开。视图菜单支持放大、缩小。

旧 Sapphire 数据不会自动迁移，请在旧组件导出 JSON，然后在独立版设置中合并导入。独立版使用自己的 data 目录，不读写 Sapphire 数据。

待办、月历、双周报等业务操作见 [使用手册](Embed_todo_worklog_pro/manual.md)，其中 Sapphire 安装部分仅适用于原组件版。

## 验证

开发需要 Node.js 22.12+。根目录执行 `npm ci`，然后 `npm start`；`npm run build:win` 生成 `build/portable/TodoWorklogPro-win32-x64/`。Electron 首次使用需联网下载官方运行时，构建产物运行时可离线使用。

`npm test` 检查状态文件持久化、冲突拒绝、目录隔离及损坏文件保护；组件目录执行 `node tests/todo-core.test.js`。安装 Playwright 后运行 `node scripts/smoke.cjs` 可对已打包 EXE 测试窗口同步、重启恢复和实际文件导出。自动测试使用独立临时数据目录。

开发默认数据在 `.portable-data/`；自动化可通过 `TODO_WORKLOG_DATA_DIR` 显式指定测试数据目录。

浏览器回归使用 Playwright：安装 Playwright 后运行 `node tests/ui-smoke.test.js`。QML JavaScript 模拟测试不能替代 Sapphire 原生窗口及文件对话框的实机验证。

## 项目来源

本组件面向 [hymnly133/swidget](https://github.com/hymnly133/swidget) 的 Sapphire 组件规范开发，依赖宿主提供的公共 QML 模块。此仓库仅包含本组件，不包含原项目的其他组件、宿主程序或用户数据。
