---
title: 添加 MCP 工具
description: 创建 stdio 服务，将状态写入 PLUGIN_DATA，并选择工具挂载方式。
---

## 从可运行服务开始

在[第一个教程](../first-plugin/)使用的项目根目录执行：

```sh
bun tools/openagent-plugin-kit/scripts/new-plugin.mjs notes-tools --template mcp-tools --dir plugins
bun tools/openagent-plugin-kit/scripts/validate-plugin.mjs plugins/notes-tools --require-i18n
```

模板提供不依赖额外包的 Node.js stdio 服务。先阅读 `server/index.mjs` 的现有实现，再扩展 `tools/list` 和 `tools/call` 处理器。保持 MCP 消息格式；日志输出到 stderr，stdout 专用于协议消息。

## 声明传输与数据

生成的 `mcp.json` 使用以下结构：

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "notes": {
      "type": "stdio",
      "command": "node",
      "args": ["${PLUGIN_ROOT}/server/index.mjs"],
      "env": { "NOTES_FILE": "${PLUGIN_DATA}/notes.json" },
      "cwd": "${PLUGIN_DATA}"
    }
  }
}
```

`${PLUGIN_ROOT}` 用于可执行资源，`${PLUGIN_DATA}` 用于持久状态，宿主在安装后展开这些值。也支持 HTTP 服务；传输和认证字段见 [MCP 规范](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/plugin-format.md)。

## Direct 与 Relay

在 `plugin.json` 的 `extensions.openagent` 中配置挂载：

```json
{
  "mcp_tool_mode": "relay",
  "mcp_tool_modes": { "notes": "direct" }
}
```

这是需要合并到现有扩展中的片段，保留能力、兼容性和国际化字段。默认 `direct` 让模型直接使用工具；`relay` 通过 `load_tool` 发现并挂载工具。逐服务覆盖使用 `mcp.json` 中的服务名。用户可以在设置里覆盖模式，工具仍受角色与权限策略约束。

需要按执行作用域控制租约时，从 `mcp-lifecycle` 模板开始，遵守[工具租约约定](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/mcp-lifecycle.md)。

## 验证已安装副本

安装、启用后，在项目对话中调用模板已有工具，确认发现工具、调用成功，并在重新打开后保留数据。随后验证错误参数、进程失败和所选挂载模式。源码变更后重新安装再测试。

不要把凭据写入归档或日志。工具的可见提示应使用宿主提供的 `_openagent.locale`；独立进程提示可查询 `host.locale.get()`。翻译提示时保留协议标识符和用户内容。
