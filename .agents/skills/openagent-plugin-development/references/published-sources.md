# Published Plugin Sources

The standard package templates, validator, and authoring/release Skills live
in the public [openagent-plugin-kit](https://github.com/BANG404/openagent-plugin-kit)
repository. The product-owned standard packages are published separately:

- [Plugin Developer / 插件开发助手](https://github.com/BANG404/openagent-plugin-kit)
  (`openagent-plugin-kit`): development, testing and qualification of other plugins.

- [Chat Groups](https://github.com/BANG404/openagent-chat-groups)
- [Goal](https://github.com/BANG404/openagent-goal)
- [Graph](https://github.com/BANG404/openagent-graph)
- [Cua Driver](https://github.com/BANG404/openagent-cua-driver)
- [Message Board](https://github.com/BANG404/message-board)

Plugin Developer and Message Board are independent packages. Their project source
checkouts are `plugins/openagent-plugin-kit/` and `plugins/message-board/`,
respectively, and `plugins/dev-index.json` maps their distinct manifest IDs.
Keep their GitHub release subscriptions, commands, MCP tools and `PLUGIN_DATA`
directories separate. Folder names inherited from earlier development are not
package identities. Plugin Developer v1.2 requires the Runtime capabilities
documented in its release and `docs/development-workflow.md`; an older Runtime
without execution IDs, MCP leases or control-file supervision cannot run its loop.

When the plugin contract changes, update the Runtime loader, the owner Skills,
and the plugin-kit validator, docs, and templates together. When a product
package changes, update its repository and release archive so the GitHub
subscription source remains installable.

Keep catalog versions and parent source gitlinks aligned with the same published
stable releases and their packaged manifests. Standard packages declare MCP
mounting policies and readable localized plugin names; they require a Runtime
implementing those policies and the generic Host Bridge. Follow
[package format](package-format.md) for declaration and settings precedence.
Release assets keep `plugin.json` at the archive root and must expose a verified
GitHub SHA-256 digest for update delivery. Verify the public download against its
GitHub digest and the accepted Git source; Windows checkout newline conversion
must not be mistaken for a different committed source.
