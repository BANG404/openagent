---
title: 本地开发与排错
description: 刷新已关联的源码包，定位加载失败，并保留可重复的验收证据。
---

## 迭代已关联源码的安装

把包保留在项目的插件目录中。在 OpenAgent 的**集成 → 插件 → 安装**中选择该目录一次。宿主校验并复制插件，同时记录与该本地源码的精确关联。运行时进程执行的是已安装副本。

修改后，OpenAgent 会检测源码内容变化，包括未提升版本号的修改。点击已安装卡片或“已安装”工具栏的**刷新**可请求同一同步流程。激活会等待共享该包目录的所有 Runtime 中的会话任务结束，先释放 MCP 和守护进程，再替换文件、刷新钩子与视图。不要为强行激活而取消无关工作。

刷新保留配置、私有设置、授权与 `PLUGIN_DATA`。源码丢失、无效、清单名称改变或链接越界时，保留已安装包并报告可恢复错误。`.git` 不参与复制和内容摘要。

归档或 Release 安装没有本地源码关联，旧安装也不会自动推断来源：通过**安装**选择目标本地目录一次即可建立关联。不要修改托管安装目录，也不要期待扫描任意文件夹。每次有意义的修改后，重新运行包校验。

## 按边界定位问题

| 现象 | 优先检查 |
| --- | --- |
| 插件被拒绝 | `plugin.json`、验证过的协议范围、必需 feature、翻译键、路径约束诊断 |
| 找不到 Skill | `skills/<name>/SKILL.md` 是否为直接子目录，目录与 frontmatter 名称是否一致，描述是否匹配任务 |
| 找不到 MCP 工具 | 启用状态、服务诊断、解释器与依赖、stdio 消息格式、用户保存的 Direct/Relay 覆盖、角色可用性 |
| 服务启动但业务失败 | 必填配置、真实账号授权、当前网络策略和核心工具调用 |
| 源码修改未生效 | 本地关联、实际选中的源码、校验错误，以及是否仍有任务阻止激活 |
| 命令在 Agent 执行前失败 | 活动工作区、包内入口路径、stdin 解析与非空 stdout 提示 |
| 侧栏缺失或内容陈旧 | 作用域、`activation_tools`、申请的上下文能力、已安装版本及 `sidebar.<id>.title` 翻译 |
| 电脑控制工具不可用 | 独立的真实电脑访问授权与平台前提；启用插件不等于授予访问 |

检查 stderr 与组件诊断，但不记录秘密。卡片可见、服务启动或配置响应成功，都不足以证明目标工作流可用。

## 验证准备交付的实际候选包

启动隔离开发实例时使用任务专属的 `OPENAGENT_HOME`，不要复用日常账号数据。保留普通执行权限策略。按需验证包校验、包自有行为测试、已安装组件、无效输入、取消、重启，以及更新与数据恢复。

包含 UI 时，在真实 OpenAgent 窗口中检查所有声明语言与明暗主题。输入过程中切换语言、切换会话或分支、重新打开视图，确认承诺保留的状态确实保留。侧栏语言变化不应重建 iframe 并丢失草稿。

保留包的源码版本与版本号或内容摘要、宿主版本、相关设置、精确断言，以及报告和日志路径。源码改变后，对新字节重新收集证据。不可用的外部服务应明确记录为尚未验证。

## 使用插件开发助手

从商店或公开包目录安装 `openagent-plugin-kit`，启用后打开项目工作区。使用结构化目标路径前，先创建项目的插件父目录：

```text
/openagent-plugin-kit:create {"goal":"创建持久化笔记工具，提供中英文提示；验证写入、读取与重启恢复","name":"my-notes","directory":"plugins/my-notes","template":"mcp-tools","template_repository":"https://github.com/BANG404/openagent-plugin-kit","template_subdirectory":"templates/mcp-tools","skills":["openagent-plugin-authoring"],"max_iterations":12}
```

也可以直接用自然语言描述需求。助手在工作区内创建或选择包，针对当前摘要记录校验、测试和隔离 Runtime 验收。MCP 验收需要真实工具结果断言，三个通用关卡不能替代你明确要求的功能或 UI 验证。

| 命令 | 用途 |
| --- | --- |
| `/openagent-plugin-kit:status` | 查看已保存进度与报告路径 |
| `/openagent-plugin-kit:stop` | 停止开发工作流 |
| `/openagent-plugin-kit:resume` | 修复失败或不满足需求后继续开发 |
| `/openagent-plugin-kit:accept` | 记录开发者对已通过资格检查候选包的验收 |

验收不会发布仓库或 Release。应检查具体候选包，再单独授权发布。助手要求 Runtime 支持执行 ID、MCP 租约和控制文件监管，详见[工作流前提与报告](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/development-workflow.md)。

## 在 OpenAgent 仓库中贡献插件？

宿主仓库的 `plugins/dev-index.json` 映射独立插件仓库。使用 `bun scripts/prepare-plugin-sources.mjs` 初始化订阅，使用 `bun run plugin:dev --path <id>` 解析安装目录。`bun run plugin:sync` 才会明确更新干净的订阅；索引本身不安装或启用插件。第三方作者无需采用此贡献者流程，也不需要修改私有 SDK。候选包验收后，继续阅读[发布与更新](../publishing/)。
