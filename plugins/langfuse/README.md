# Langfuse for OpenAgent

An installable, dependency-free observability integration inspired by
[Langfuse's Codex plugin](https://github.com/langfuse/codex-observability-plugin).
Requires Node.js 22+ and an OpenAgent Runtime supporting plugin protocol 1,
`configuration-v1`, and `integration-v1`.

Install the `plugins/langfuse` directory through **Settings > Plugins > Install
local directory**. Installation copies the package; reinstall after source changes.
This is an unpublished candidate, with no GitHub update subscription or catalog entry.

In the plugin configuration, save your Langfuse project public key and secret key,
choose the base URL (default EU: `https://cloud.langfuse.com`), then enable upload.
US: `https://us.cloud.langfuse.com`; Japan: `https://jp.cloud.langfuse.com`.
HTTPS is required except for loopback HTTP self-hosted/test endpoints.
Secrets use OpenAgent's private plugin settings store. Do not put them in this package.

- `/langfuse:status` reports readiness and queue counts without exposing credentials.
- `/langfuse:test` sends a synthetic span to verify authentication and OTLP ingestion.
- `/langfuse:retry` uploads up to three completed pending executions.

Each Runtime execution becomes a trace with an Agent root, model timing generations,
and tool spans. Conversation IDs group traces into sessions; child conversations
carry parent/role metadata and use the known parent conversation as their session.
Branch and execution identities distinguish forks and approval resumes. Successful,
failed, cancelled and interrupted execution phases are retained. Child traces are
correlated by metadata; the plugin does not infer cross-execution parent span IDs.

The public hook contract does not supply prompts, reasoning, model names, token
usage or costs. Those fields remain absent. The plugin never reads internal
databases, Inspector files or Codex transcripts. Tool inputs and outputs are
available but excluded by default. **Capture tool content** separately opts into
storing and uploading these potentially sensitive values. Each value is truncated
at 8192 characters; local pending telemetry may include captured tool content.

Uploads use Langfuse's supported
[OTLP HTTP/JSON endpoint](https://langfuse.com/integrations/native/opentelemetry)
with Basic project authentication and ingestion version 4. There are no npm runtime
dependencies and no install hook, daemon, MCP server or host-access exemption.
Normal OpenAgent process and network permissions apply. Allow the configured
Langfuse host in the active permission profile; enabling this plugin does not
broaden that profile.

Hooks record locally and upload at Stop. Failed uploads retain records and retry
on a later Stop or explicit retry. Uploads time out after four seconds, never
follow redirects, and only acknowledge complete acceptance. IDs are deterministic
so retries refer to the same spans. Hooks print no stdout and cannot add model
context or prevent Runtime finalization. Disabling upload prevents both recording
and sending pending telemetry. Turning off content capture also suppresses content
from previously queued records during export.

Package data uses version 1 records under `PLUGIN_DATA/executions`. Atomic writes
and cross-process locks protect parallel executions; at most 128 records and 1000
events per execution are retained. Delivered receipts are compacted; an
eligible receipt makes room for a new execution. Unsent records are never silently
evicted. A full queue skips new telemetry with `storage_limit`; clear only reviewed
task-owned records or upload the backlog. A crashed process lock expires after
30 seconds. Queued records survive updates and uninstall. Configuration changes
apply to subsequent hooks and pending uploads, so flush the queue before switching
Langfuse projects.

## 中文使用说明

在设置 > 插件中从本地目录安装 `plugins/langfuse`。在插件配置中填写 Langfuse
项目公钥、密钥和服务地址，再开启上传。默认关闭上传和工具内容采集。
`/langfuse:status` 查看状态，`/langfuse:test` 发送连接测试，`/langfuse:retry`
重试失败记录。模型调用目前只有时序信息，不包含模型内容、token 用量或费用。
开启“采集工具内容”后，工具输入输出会写入本地待上传队列并发送到 Langfuse。
网络权限仍由 OpenAgent 控制；切换 Langfuse 项目前请先处理待上传队列。

## Verification

From the host checkout:

```sh
bun plugins/openagent-plugin-kit/scripts/validate-plugin.mjs plugins/langfuse --require-i18n --locales=en,zh
bun test plugins/langfuse/tests
bun plugins/langfuse/scripts/verify-runtime.mjs
```

The Runtime verifier uses the source-prepared server, a fresh isolated home,
fake credentials and loopback model/OTLP endpoints. It exercises installation,
saved configuration, real model/tool hooks, upload failure/retry and disablement.
Reports stay under the system temporary directory.

For native settings qualification, launch a source-prepared Tauri instance with
a fresh temporary home containing `openagent-langfuse-native-` in its path. Set
`OPENAGENT_HOME`, that instance's explicit `TAURI_PILOT_SOCKET`, and its main HWND
in `BLACKBOX_NATIVE_WINDOW_HANDLE`, then run:

```sh
bun plugins/langfuse/scripts/verify-native.mjs
```

This runs the committed settings scenario in light/dark and English/Chinese,
saves and reopens parameters, verifies secret redaction/preservation/clearing,
captures native windows and removes only its fixture package.

Tests exercise mock OTLP ingestion, process hooks, concurrent writes, retries,
deduplication, cancellation, configuration and privacy boundaries. A real project
is qualified separately with `/langfuse:test` and a tool-using conversation.
