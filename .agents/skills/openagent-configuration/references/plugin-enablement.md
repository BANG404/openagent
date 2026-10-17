# Package lifecycle settings

`agent_plugins_enabled` is the lifecycle source for installed packages. Desktop
control packages use the same default and explicit override as other packages;
the presence or enabled state of an ordinary MCP server never controls a package.
User MCP servers and package contributions have independent identities.
