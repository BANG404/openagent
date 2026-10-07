---
title: 插件包约定
description: 理解可移植插件身份、OpenAgent 扩展、协议兼容性和持久数据。
---

## 加载器读取哪些文件

```text
project-notes/
  plugin.json
  skills/
    project-notes/
      SKILL.md
  mcp.json             # 可选 MCP 声明
  ui/panel.html        # 由侧栏扩展引用
  bin/                 # 由命令或钩子引用
```

加载器读取 `plugin.json`、直接子目录里的 Skill 和可选 `mcp.json`。其他目录是包内数据，只有被扩展引用才参与相应功能。

## 一个小型清单

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "project-notes",
  "version": "1.0.0",
  "description": "Record project decisions.",
  "repository": "https://github.com/you/project-notes",
  "extensions": {
    "openagent": {
      "compatibility": { "plugin_protocol": { "min": 1, "max": 1 } },
      "capabilities": ["skills"],
      "i18n": {
        "supported_locales": ["en", "zh"],
        "default_locale": "en",
        "translations": {
          "en": { "display_name": "Project Notes", "description": "Record project decisions." },
          "zh": { "display_name": "项目笔记", "description": "记录项目决策。" }
        }
      }
    }
  }
}
```

发布前替换示例仓库地址。小写、可移植的 `name` 用于路由、更新和数据身份，应保持稳定。翻译 `display_name`，不要翻译 ID。使用 SemVer 让更新顺序可预测。OpenAgent 专属字段属于 `extensions.openagent`，不能放入可移植的 MCP 声明。

## 协议与可选能力

当前模板声明插件协议 1。只声明验证过的范围，插件版本与 Runtime 版本是不同边界。协议准入不保证所有可选 Host Bridge 操作都存在；调用可选的 embedding 或会话 UI 前检测支持情况，缺失时提供可操作的提示。

创建对话或唤醒 Agent 的工作流应使用共享 [Host Bridge 客户端](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/host-bridge.md)。领域状态和编排由插件管理，无须导入私有 SDK。

## 代码与数据生命周期不同

| 位置 | 用途 |
| --- | --- |
| `${PLUGIN_ROOT}` | 已安装的包文件，不作为可写数据库 |
| `${PLUGIN_DATA}` | 插件自己的持久状态，更新和卸载时保留 |

使用导出的变量，不自行推导用户目录。插件进程遵守当前执行权限策略，并获得自己数据目录的写权限。需要访问真实电脑时，沿用宿主的明确授权流程，清单声明不会授予无限权限。

包内路径不能通过 `..`、符号链接或目录联接越界。畸形的可选组件可能被单独禁用；清单被拒绝则不能加载。检查诊断并逐项验证声明的组件，不要把插件卡片可见当成工具已加载的证明。

命令、自动化、守护进程和会话组件的完整字段见[公开规范](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/plugin-format.md)。
