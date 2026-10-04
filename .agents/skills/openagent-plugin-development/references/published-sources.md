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

Keep catalog versions aligned with stable releases and their packaged manifests.
The Goal v2.2.0 package includes shared slash/tool lifecycle controls and durable
cancellation; Graph v1.0.4 publishes progress only after graph creation succeeds.
Both require the generic Host Bridge. Release assets keep `plugin.json` at the
ZIP root and must expose a verified GitHub SHA-256 digest for update delivery.
