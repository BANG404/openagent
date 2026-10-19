---
title: 配置与授权
description: 添加宿主设置表单，将私有参数绑定到自己的进程，并连接 HTTP MCP 服务。
---

需要用户安装后补充的参数，使用宿主渲染的配置表单。包里保存字段定义和默认值，用户填写的值保存在归档之外。本章接续 [MCP 工具](../mcp/)。

## 添加设置表单

把下面片段合并到 `notes-tools/plugin.json` 的 `extensions.openagent`，保留已有能力和国际化声明：

```json
{
  "compatibility": {
    "plugin_protocol": { "min": 1, "max": 1 },
    "features": ["configuration-v1"]
  },
  "configuration": {
    "version": 1,
    "fields": [
      { "key": "api-token", "label": "API token", "type": "string", "secret": true, "required": true },
      { "key": "limit", "label": "Result limit", "type": "integer", "default": 20, "minimum": 1, "maximum": 100 }
    ]
  }
}
```

为**每种**已声明语言补充 `configuration.api-token.label` 和 `configuration.limit.label` 翻译。字段包含 `description` 时，还要添加 `configuration.<key>.description`。扩展已有插件时，保留原有的必需 feature。

字段支持 `string`、`boolean`、`integer`、`enum`。键与绑定必须唯一，secret 只能是没有包内默认值的字符串。必填项在设置前保持缺失；保存的 `false` 是有效布尔值。限制与枚举写法见[配置规范](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/configuration.md)。

## 在自己的进程中读取

本例的默认绑定是 `PLUGIN_CONFIG_API_TOKEN` 和 `PLUGIN_CONFIG_LIMIT`：

```js
const token = process.env.PLUGIN_CONFIG_API_TOKEN;
const limit = Number(process.env.PLUGIN_CONFIG_LIMIT ?? '20');
// 没有 token 时仍允许调用配置诊断工具。
// 账号操作应返回可操作的“需要配置”结果。
```

参数只传给本插件的 stdio MCP、命令、钩子和守护进程启动。库要求其他变量名时，才用显式 `env` 指定允许的大写名称。保存会重连 MCP、重新加载钩子；已经运行的守护进程需要明确重启。

OpenAgent 把值单独保存在当前数据目录的 `plugin-settings/<id>.json`，更新或卸载插件时保留。Windows 使用当前用户 DPAPI 保护秘密，Unix 使用私有目录与文件权限。插件不要直接读取此文件，也不要要求用户把凭据写进 `plugin.json`。

未改动的空密码框会保留已存秘密。点击**清除**后再**保存**才会移除。旧版本表单提交会被拒绝，避免另一个设置编辑器静默覆盖新值。

## 连接 HTTP 服务

在根目录 `mcp.json` 中声明服务，例如：

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "service": { "type": "streamable-http", "url": "https://api.example.com/mcp" }
  }
}
```

把示意地址替换成供应商的真实 MCP 端点。使用 HTTPS，不支持旧式 HTTP+SSE。供应商要求用户提供 bearer token 时，为 secret 字符串字段设置 `"mcp": {"server": "service", "property": "bearer_token"}`，不要同时设置 `env`。服务必须属于本插件。HTTP 绑定允许 `bearer_token`、`oauth_client_id`、`oauth_scope`，其中只有 bearer token 是秘密。

需要浏览器 OAuth 时，还要声明必需 feature `plugin-oauth-v1`。在 MCP 条目里只填写供应商必要的发现或公开客户端提示：`oauth_resource`、`oauth_authorization_server`、`oauth_client_id`、`oauth_scope`。发现、浏览器回调、令牌存储、刷新和重连由 Runtime 管理。支持公开客户端 PKCE 与动态注册；机密客户端 secret 和 CIMD 不属于受支持配置字段。

用户从已安装插件的设置中测试连接并授权。修改绑定的客户端或 scope 参数，会断开旧的本地授权。**断开连接**只移除本地令牌；撤销供应商授权需要在供应商账号中另行操作。

## 分别验证配置与真实服务

校验插件并安装，检查保存、重新打开、清除，以及缺失和无效参数。OAuth 使用隔离的模拟供应商覆盖成功、拒绝、取消、断开与重连。具备真实账号时，再调用一次经过认证的**核心业务工具**。

配置或状态工具成功，只证明配置诊断能运行。没有账号时，应把真实账号操作记录为未测试。接着阅读[命令与钩子](../commands/)，或使用[本地排错清单](../local-development/)。
