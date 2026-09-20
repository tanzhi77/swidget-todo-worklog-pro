# 待办与工作记录 Pro

适用于 Sapphire 桌面的离线待办与工作记录小组件，版本 **1.0.0**。

## 功能

- 待办新增、编辑、优先级、标签、子任务、重复任务、筛选与拖动排序。
- 独立工作记录、关联待办工作项，以及实际完成时间展示。
- 独立工作月历、标题换行、日期格内滚动。
- 双周报 TXT 导出，可选择本周为第一周或第二周，也可自选日期范围。
- JSON 备份导入导出、月份 CSV 导出、页面内日期时间选择器。

## 安装

将 `Embed_todo_worklog_pro/` 目录作为 QML 组件导入 Sapphire。打包 `.sawidget` 时，ZIP 根目录需要直接包含组件的 `metadata.json`，不要多包一层目录。

详细说明见 [使用手册](Embed_todo_worklog_pro/manual.md)。

## 验证

在组件目录执行 `node tests/todo-core.test.js`。

浏览器回归使用 Playwright：安装 Playwright 后运行 `node tests/ui-smoke.test.js`。QML JavaScript 模拟测试不能替代 Sapphire 原生窗口及文件对话框的实机验证。

## 项目来源

本组件面向 [hymnly133/swidget](https://github.com/hymnly133/swidget) 的 Sapphire 组件规范开发，依赖宿主提供的公共 QML 模块。此仓库仅包含本组件，不包含原项目的其他组件、宿主程序或用户数据。
