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
parent.postMessage({ type: 'openagent:sidebar-ready', version: 1 }, '*');
```

先注册监听器，再发送 ready 通知。上下文是允许列表，不代表可以读取整个应用。不要依赖对话正文、模型输出、私有诊断或其他插件状态。申请 `files` 能力得到的是元数据，不是文件内容。状态需要跟随 `branch_id` 时还须申请 `branch`；会话作用域本身不标识具体分支。

## 选择侧栏或内联会话 UI

| 界面 | 上下文与生命周期 | 交互方式 |
| --- | --- | --- |
| 侧栏 | 有工作区或会话作用域的视图；`openagent:sidebar-context` | 声明的上下文与宿主中介的本插件工具桥接 |
| 会话 UI | 持久化的检查点记录；`openagent:conversation-ui-context` | 通过版本化 state/result 通道更新 props |

侧栏要调用本插件工具时，申请 `workspace` 并遵守[侧栏桥接约定](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/plugin-format.md#sidebar)。调用限定在所属插件工具，需要活动工作区。不要把进程 Host Bridge 令牌暴露给 HTML。

需要持久内联状态卡时，声明 `ui_components`，包含 `id`、`version: 1`、`title` 和包内 HTML `entry`。已认证进程先检测 `host.conversation.ui.capabilities()`，再用 `host.conversation.ui.set()` 提交稳定的本地记录 ID、组件身份、props 和非空文本 fallback。复用 ID 更新原位置，新 ID 追加记录。

内联文档须自包含，脚本与样式放在 HTML 内；其沙盒不提供网络或宿主令牌。校验发送者、类型和版本，消费实时语言、主题与 props，并在收到匹配且成功的 `openagent:conversation-ui-state-result` 后才显示保存成功。包被移除或组件不受支持时展示持久化 fallback。完整声明与载荷见[会话 UI 指南](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/conversation-ui.md)。

## 只在工作流相关时显示侧栏

侧栏可选的 `activation_tools` 列出实际暴露的精确工具名。当前分支出现匹配的 assistant 工具调用，或存在匹配的插件自有 flow 投影时，视图才可见，其他分支不会因此激活。不声明时按普通作用域判断可用性。Graph 可作为视图关联工作流的参考，但此字段不是权限检查。

## 声明真实的语言支持

在 `extensions.openagent.i18n` 中填写支持语言、属于该列表的默认语言，以及完全对应的翻译键。侧栏元数据使用 `sidebar.example-panel.title`，修改 ID 后所有语言都要同步修改这个键。面板内容、加载、错误、无障碍标签和后续提示也需要翻译。

OpenAgent 当前平台语言 ID 为 `en` 和 `zh`，插件可以支持其中部分语言。按宿主语言精确匹配，再匹配基础语言，最后回退到声明的默认语言。不要用 `navigator.language` 覆盖宿主，不增加独立语言选择器，也不凭文档翻译或模型能力声称 UI 支持某种语言。

## 验收

```sh
bun tools/openagent-plugin-kit/scripts/validate-plugin.mjs plugins/notes-panel --require-i18n
```

安装并打开侧栏。切换对话，验证作用域隔离。保持侧栏打开，切换中英文和明暗主题，保留输入、选择和已存储数据。重新打开、重新启用插件，检查初始化。平台语言不受支持时，卡片应说明实际回退语言，不声称完整支持。
