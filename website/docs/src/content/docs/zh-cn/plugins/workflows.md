---
title: Host Bridge 工作流
description: 通过共享公开能力与插件自有状态，实现感知会话和分支的任务编排。
---

Goal、Graph、Chat Groups 都由普通命令、MCP 工具、钩子和视图组合而成，领域规则放在自己的包里。Runtime 通过共享 Host Bridge 提供会话持久化、Agent 执行、取消、权限和分支管理。

## 按行为选择参考插件

| 参考插件 | 适合学习的内容 |
| --- | --- |
| [Goal](https://github.com/BANG404/openagent-goal) | 有界续跑、完成判断、取消与恢复 |
| [Graph](https://github.com/BANG404/openagent-graph) | 依赖调度、并行任务、分支投影与进度视图 |
| [Chat Groups](https://github.com/BANG404/openagent-chat-groups) | 插件自有成员关系、角色、提及解析与唤醒路由 |
| [Message Board](https://github.com/BANG404/openagent-message-board) | 持久协作记录与带作用域的视图 |
| [插件开发助手](https://github.com/BANG404/openagent-plugin-kit) | 校验、测试、隔离 Runtime 验收与开发者验收 |

结合阅读 `plugin.json`、命令入口、MCP 服务、状态模块和 UI。记录参考的源码版本，这些仓库独立发布。Multi-Agent V2 属于 Runtime 能力；上述插件使用公开操作添加各自的工作流。

## 把公开客户端放进包内

从公开 Plugin Kit 复制 `lib/openagent-host.mjs` 到插件，保留许可证。对于 `server/index.mjs`，将客户端放在 `server/openagent-host.mjs` 后，以下导入即可自包含运行：

```js
import { createPluginHost, requireConversationContext } from './openagent-host.mjs';

const host = createPluginHost();

async function startWorker(toolArguments) {
  const { conversationId } = requireConversationContext(toolArguments);
  const child = await host.conversation.create({
    title: '项目笔记复核',
    parent_conv_id: conversationId,
  });
  await host.agent.wake(
    { conv_id: child.conv_id, branch_id: child.branch_id, text: '复核项目决策，报告尚未解决的问题。' },
    { wait: false },
  );
  return { conversationId: child.conv_id, branchId: child.branch_id };
}
```

从完成参数校验的 MCP 处理器调用此函数。宿主向启用插件的进程提供 `OPENAGENT_PLUGIN_HOST_URL`、`OPENAGENT_PLUGIN_HOST_TOKEN` 和 `OPENAGENT_PLUGIN_ID`，客户端负责认证。不要硬编码、持久化令牌或把它暴露给 iframe。该进程客户端不在侧栏 HTML 中运行。

工作可能超过桥接请求超时时，使用 `{ wait: false }`。唤醒成功表示已调度，不表示任务完成。将子会话标识保存到 `PLUGIN_DATA`，通过 `host.conversation.state(childId, branchId)` 检查状态，进入终态后再调度依赖它的任务。

## 显式保存状态和分支

插件自己持久化状态 schema、任务预算、依赖状态与恢复决策。按会话**和分支**隔离工作流记录。续跑时传入保存的 `branch_id`，将 `parent_checkpoint_id` 省略或设为 null；宿主在提交时解析该分支的当前头。恢复其他分支的工作时，不要静默读取界面当前选中的分支。

使用 `conversation.flow.set` 保存插件自有的不透明分支投影，让宿主携带进度并写入检查点，无须理解领域状态。宿主不实现插件 reducer 或完成规则。精确参数、钩子上下文与错误处理见[客户端规范](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/host-bridge.md)。

结合 [Stop 阶段规则](../commands/#处理完成与取消)，按执行 ID 去重，限制重试和迭代，并保留审批与取消决定。验收覆盖慢速子任务、依赖失败、重新加载、兄弟分支与取消，再报告完成。

## 检测可选能力

`host.call('runtime.plugin_contract')` 返回当前 `plugin_protocol` 和受支持的 `features`。旧 Runtime 可能拒绝此操作，需要处理不支持的响应。必需能力写入 `compatibility.features`，让不支持的宿主在执行代码前拒绝加载；真正可选的操作则检测能力并提供可用回退。

例如写入会话 UI 前调用 `host.conversation.ui.capabilities()`，本地 embedding 前调用 `host.embedding.status()`。模型受支持但未就绪，与操作不受支持是不同情况；两者都不授权把数据发送到其他服务。共享宿主操作让插件无须引入私有 SDK 代码。

## 对话观察须明确同意

普通钩子与侧栏上下文不暴露完整对话。需要有限 Stop 观察投影的插件，同时声明 `conversation-observations-v1` 和 `configuration-v1`，并添加版本 1 的 `conversation_observations` 扩展，关联一个明确默认为 `false` 的布尔配置同意字段。只有用户明确保存 `true`，本插件才会收到观察内容。

采集与上传使用独立开关，默认关闭。不要抓取应用数据库或诊断信息补齐上下文。实现采集、撤销与有界导出前，先阅读公开的[观察格式](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/plugin-format.md#conversation-observations)。
