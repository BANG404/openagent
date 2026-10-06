# Published Plugin Sources

The standard package templates, validator, and authoring/release Skills live
in the public [openagent-plugin-kit](https://github.com/BANG404/openagent-plugin-kit)
repository. The product-owned standard packages are published separately:

- [Chat Groups](https://github.com/BANG404/openagent-chat-groups)
- [Goal](https://github.com/BANG404/openagent-goal)
- [Graph](https://github.com/BANG404/openagent-graph)
- [Cua Driver](https://github.com/BANG404/openagent-cua-driver)
- [Message Board](https://github.com/BANG404/message-board)

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
