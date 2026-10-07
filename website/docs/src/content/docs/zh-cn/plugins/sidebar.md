---
title: 侧栏与国际化
description: 构建跟随宿主作用域、主题和语言的沙盒视图。
---

## 创建侧栏

```sh
bun tools/openagent-plugin-kit/scripts/new-plugin.mjs notes-panel --template sidebar-panel --dir plugins
```

模板提供 `ui/panel.html` 和侧栏声明。保留完整清单，然后修改对应条目：

```json
{
  "id": "example-panel",
  "title": "Example panel",
  "entry": "ui/panel.html",
  "scope": "conversation",
  "capabilities": ["conversation", "locale", "theme"]
}
```

片段是 `extensions.openagent.sidebar` 数组中的一个条目，扩展本身还声明 `capabilities: ["sidebar"]`。根据视图状态边界选择 `global`、`workspace` 或 `conversation` 作用域。

## 只消费声明的上下文

UTF-8 HTML 在沙盒 iframe 中运行。宿主在加载后及上下文变化时发送版本 1 的 `openagent:sidebar-context` 消息。使用前校验发送者和载荷：

```js
addEventListener('message', (event) => {
  const context = event.data;
  if (event.source !== parent || context?.type !== 'openagent:sidebar-context' || context.version !== 1) return;
  if (typeof context.locale !== 'string') return;
  document.documentElement.dataset.hostLocale = context.locale;
  // 解析支持的语言，更新可见文本，保留输入。
  // 声明 theme 后应用 context.theme，以 context.conversation_id 隔离状态。
});
```

上下文是允许列表，不代表可以读取整个应用。不要依赖对话正文、模型输出、私有诊断或其他插件状态。申请 `files` 能力得到的是元数据，不是文件内容。需要持久化会话控件而非 iframe 时，参见[会话 UI](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/conversation-ui.md)。

## 声明真实的语言支持

在 `extensions.openagent.i18n` 中填写支持语言、属于该列表的默认语言，以及完全对应的翻译键。侧栏元数据使用 `sidebar.example-panel.title`，修改 ID 后所有语言都要同步修改这个键。面板内容、加载、错误、无障碍标签和后续提示也需要翻译。

OpenAgent 当前平台语言 ID 为 `en` 和 `zh`，插件可以支持其中部分语言。按宿主语言精确匹配，再匹配基础语言，最后回退到声明的默认语言。不要用 `navigator.language` 覆盖宿主，不增加独立语言选择器，也不凭文档翻译或模型能力声称 UI 支持某种语言。

## 验收

```sh
bun tools/openagent-plugin-kit/scripts/validate-plugin.mjs plugins/notes-panel --require-i18n
```

安装并打开侧栏。切换对话，验证作用域隔离。保持侧栏打开，切换中英文和明暗主题，保留输入、选择和已存储数据。重新打开、重新启用插件，检查初始化。平台语言不受支持时，卡片应说明实际回退语言，不声称完整支持。
