---
title: 命令与生命周期钩子
description: 将斜杠输入转成 Agent 提示，并响应生命周期事件，无须嵌入私有 Runtime 循环。
---

Skill 提供指令，MCP 工具执行操作，斜杠命令为用户提供明确入口，钩子响应执行事件。按实际工作流组合这些组件。

## 创建可移植命令

从项目根目录执行：

```sh
bun tools/openagent-plugin-kit/scripts/new-plugin.mjs notes-command --template slash-commands --dir plugins
```

把生成的 `extensions.openagent.commands` 命令条目替换为：

```json
{
  "id": "summarize",
  "label": "Summarize decisions",
  "description": "Summarize decisions for the supplied topic",
  "argument": "required_text",
  "command": "bin/summarize.mjs",
  "timeout_secs": 30
}
```

创建 `bin/summarize.mjs`：

```js
import { readFileSync } from 'node:fs';

const request = JSON.parse(readFileSync(0, 'utf8'));
if (typeof request.argument !== 'string' || !request.argument.trim()) {
  console.error('A topic is required.');
  process.exit(1);
}
process.stdout.write(
  `总结该主题下已确认的决策与待解决问题。先阅读相关项目文件并附上引用。\n主题：${request.argument}`
);
```

把每种已声明语言中的 `commands.word-count.*` 翻译键替换成 `commands.summarize.label` 和 `commands.summarize.description`，移除不再使用的生成脚本。校验、安装后，在已打开工作区的对话中输入 `/notes-command:summarize 发布计划`。

宿主通过 stdin 写入 JSON，包含 `conversation_id`、`branch_id`、`plugin_id`、`command`、`argument` 和原始 `input`。stdout 必须是非空的**提示词**，它随后进入普通 Agent 流程，不是直接返回工具结果的通道。诊断日志写入 stderr。`argument` 也可以使用 `none` 或 `optional_text`。

命令的工作目录是当前工作区。使用 `PLUGIN_ROOT` 或脚本自身位置定位包内资源，持久插件状态写入 `PLUGIN_DATA`。`command` 是包内可执行文件路径，不是 shell 表达式。`.mjs`/`.js` 入口使用 Node；原生或 shell 启动器需要按平台处理，把模板的 `.cmd` 示例移植到其他平台时尤其要注意。

## 添加事件钩子

使用 `automation-hooks` 模板获得完整起点。其扩展把自动化条目与消息受众声明组合起来：

```json
{
  "automation": [
    { "id": "after-tool", "event": "after_tool", "matcher": "^(apply_patch|exec_command)$", "command": "hooks/after-tool.mjs", "timeout_secs": 15 }
  ],
  "message_policies": [
    { "tag": "notice", "user_visible": true, "model_visible": false }
  ]
}
```

创建引用的文件，在处理器确有信息需要报告时输出通知：

```js
process.stdout.write(JSON.stringify({ message: '项目笔记需要复核。', tag: 'notice' }));
```

这里只展示输出结构，真实通知应按宿主实时语言翻译。宿主使用已认证插件身份为本地 tag 添加命名空间；未声明 tag 会被拒绝。只面向用户的通知会持久化为 UI 记录，不会成为用户创作的提示，也不会追加到其他工具结果末尾。未标记的纯文本保持钩子默认的模型上下文行为。

钩子路由位于 stdin 信封的 `event` 内。使用公开客户端的 `hookEvent`、`hookContext` 辅助函数，不要假定标识符位于顶层。匹配目标事件实际暴露的工具名；钩子遵守普通权限策略，并须在超时前完成。

## 处理完成与取消

需要持续工作的 Stop 钩子，使用 `event.execution_id` 对每次执行去重，并检查 `event.phase`：

| 阶段 | 工作流应如何处理 |
| --- | --- |
| `interrupted` | 等待现有审批或用户输入 |
| `final_completed` | 仅在插件还有待办且未超预算时继续 |
| `final_cancelled` | 停止并保留取消状态 |
| `final_failed` | 保留诊断，等待明确恢复 |

调度下一次唤醒前，先持久化有界的续跑状态。不要重启用户取消的任务，也不要替换未解决的审批。[Host Bridge 工作流](../workflows/)说明如何让唤醒跟随正确分支，[本地开发](../local-development/)提供可重复的验收方法。
