---
title: 第一个插件
description: 不编译 OpenAgent 源码，创建、校验并安装一个简单的 Skill 插件。
---

准备已安装的 OpenAgent、Git，以及 Bun 1.2 或更新版本。使用脚本或 MCP 模板时还需要 Node.js。开发插件不需要访问 OpenAgent 的私有 SDK，也不需要从源码构建桌面应用。

## 1. 获取公开工具链

从你的项目根目录执行。示例把插件放在 `plugins/`，工具链放在 `tools/`；已有项目约定时沿用项目目录。

```sh
git clone https://github.com/BANG404/openagent-plugin-kit.git tools/openagent-plugin-kit
bun tools/openagent-plugin-kit/scripts/new-plugin.mjs project-notes --template minimal --dir plugins
```

生成的目录为 `plugins/project-notes/`。让 `plugin.json` 保持在包根目录，保留模板生成的协议兼容性和语言声明。

## 2. 编写 Skill

将生成的 Skill 目录替换为 `skills/project-notes/SKILL.md`：

```markdown
---
name: project-notes
description: 当用户要求记录或回顾项目决策时，整理项目决策摘要。
---

先阅读相关项目文件，再总结。
区分已经确认的决策与待解决的问题。
用户要求保存时，写入用户指定的项目路径。
附上文件引用，不包含凭据。
```

Skill 从 `skills/` 的直接子目录发现，必须有 YAML `name` 和 `description`。Skill 提供指令，本身不会注册可执行工具。是否加载取决于任务，因此描述要明确适用场景。

## 3. 校验插件

```sh
bun tools/openagent-plugin-kit/scripts/validate-plugin.mjs plugins/project-notes --require-i18n
```

安装前修复错误并检查警告。校验器检查包结构，不执行插件命令或服务。只声明已经覆盖元数据和可见界面的 UI 语言。

## 4. 安装并试用

打开 **集成 → 插件 → 安装**，选择 `plugins/project-notes/`。启用插件，打开项目对话，让 Agent 使用 `project-notes` 总结一项具体决策。

OpenAgent 会把源码复制到托管插件目录。**修改源码后需要重新安装**，修改开发目录不会自动改变已安装副本。隔离验收时使用独立测试安装或任务专属的 `OPENAGENT_HOME`，保留日常数据。

确认目标任务能发现 Skill、引用真实项目文件，并遵守选定的审批策略，再阅读[插件包约定](../package/)。

## 想让 Agent 协助开发？

安装插件开发助手（`openagent-plugin-kit`），通过 `/openagent-plugin-kit:create` 工作流创建和验收插件。该助手需要支持执行 ID、MCP 租约和控制文件监管的较新 Runtime，具体见其[工作流要求](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/development-workflow.md)。
