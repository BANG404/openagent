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
      "category": "productivity",
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

当前模板声明插件协议 1，只声明验证过的范围。以下版本各有用途：

| 标识 | 含义 |
| --- | --- |
| 可移植 `$schema` 版本 | 包或 MCP 格式，当前为 Agent Plugins 1.0.0 |
| 包 `version` | 插件独立发布的版本 |
| `compatibility.plugin_protocol` | 已验证的 OpenAgent 插件协议闭区间 |
| `compatibility.features` | 必需的版本化能力；不支持时拒绝加载 |
| Runtime 发布版本 | 宿主实现版本，不能替代能力检测 |

例如，配置需要 `configuration-v1`，浏览器 OAuth 需要 `plugin-oauth-v1`，主题包需要 `theme-v1`。组合组件时保留所有必需 feature。协议准入不保证所有可选 Host Bridge 操作都存在；调用可选的 embedding 或会话 UI 前检测支持情况，缺失时提供可操作的提示。运行时发现方式见 [Host Bridge 工作流](../workflows/)。

创建对话或唤醒 Agent 的工作流应使用共享 [Host Bridge 客户端](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/host-bridge.md)。领域状态和编排由插件管理，无须导入私有 SDK。

## 代码与数据生命周期不同

| 位置             | 用途                                 |
| ---------------- | ------------------------------------ |
| `${PLUGIN_ROOT}` | 已安装的包文件，不作为可写数据库     |
| `${PLUGIN_DATA}` | 插件自己的持久状态，更新和卸载时保留 |
| 宿主管理的 `plugin-settings/<id>.json` | 用户配置与秘密，通过声明的绑定消费 |

使用导出的变量，不自行推导用户目录。插件进程遵守当前执行权限策略，并获得自己数据目录的写权限。需要访问真实电脑时，沿用宿主的明确授权流程，清单声明不会授予无限权限。

包内路径不能通过 `..`、符号链接或目录联接越界。畸形的可选组件可能被单独禁用；清单被拒绝则不能加载。检查诊断并逐项验证声明的组件，不要把插件卡片可见当成工具已加载的证明。

命令、自动化、守护进程和会话组件的完整字段见[公开规范](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/plugin-format.md)。

## 按需求选择组件边界

| 需求 | 组件 | 下一章 |
| --- | --- | --- |
| 可复用任务指令 | 内置 Skill | [第一个插件](../first-plugin/) |
| 执行有类型的操作 | MCP 服务 | [MCP 工具](../mcp/) |
| 用户参数或 OAuth | 配置与 HTTP MCP | [配置](../configuration/) |
| 明确入口或生命周期响应 | 命令或自动化钩子 | [命令](../commands/) |
| 带作用域的面板或持久内联记录 | 侧栏或会话 UI | [UI 与语言](../sidebar/) |
| 感知会话的任务编排 | 插件状态与 Host Bridge | [工作流](../workflows/) |

工具链还提供 `theme` 和 `integration` 模板。主题使用 `type: "theme"`、`theme` 下经过校验的 token 和 `theme-v1`，不能注入任意应用 CSS。集成展示使用 `type: "integration"`、`integration-v1` 及引用的 Skill/MCP 组件。保留对应模板声明，具体见[展示字段规范](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/plugin-format.md)。分类与包类型、权限授权分别处理。

## 分类

可选字段 `extensions.openagent.category` 声明一个稳定分类 ID：`development`（开发工具）、`productivity`（效率工具）、`communication`（沟通协作）、`automation`（自动化）、`data`（数据与知识）、`design`（设计创作）或 `other`（其他）。省略时为“未分类”；空值、数组和未知 ID 会导致清单校验失败。界面负责翻译分类名称，ID 不随语言改变。商店分类筛选与搜索、安装状态筛选组合生效。分类只用于展示和发现，不授予权限，也不改变插件协议版本。
