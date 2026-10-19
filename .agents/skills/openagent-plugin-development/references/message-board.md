# Message Board host integration

Message Board / 留言板 is the independent `BANG404/openagent-message-board`
package at `plugins/message-board/`. Plugin Developer / 插件开发助手 belongs to
`plugins/openagent-plugin-kit/`; keep their source subscriptions and publication separate.

The parent owns its source subscription and `tests/messageBoardPlugin.test.ts`
integration coverage. The package [README](https://github.com/BANG404/openagent-message-board/blob/main/README.md)
owns tools, persistence, locking/recovery, pagination and idempotency. Prepare its
source subscription before host integration tests. Publish accepted sources and
Releases independently; no parent gitlink or catalog version bump is required.

## Host boundary

The loader supplies `PLUGIN_DATA`; never substitute a workspace or installed-package
fallback. Processes sharing that directory share one board. Caller-supplied
`agent_id` is a label, not authenticated Runtime identity. The portable MCP
transport cannot wake an idle child; recipients and subscriptions remain handoff
metadata. Do not grant transcript/model-context access or host credentials.
Runtime's optional `_openagent` context does not authenticate the caller.

## Acceptance

Run the package's tests and current Plugin Kit validator, then
`bun run test:blackbox:message-board` in a fresh isolated Tauri instance. Cover
installation through Runtime, all nine tools, disable/re-enable and uninstall/
reinstall with preserved data. Published-source qualification additionally sets
`BLACKBOX_PLUGIN_IDS=message-board` on the ordinary plugin lifecycle runner.
Record package and SDK revisions separately. Verify platform locale coverage,
live locale switching and both themes; user-authored content and IDs stay unchanged.
