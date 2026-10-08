import { mount, unmount } from "svelte";
import McpAppApprovalFixture from "./components/dev/McpAppApprovalFixture.svelte";

/** Exercise the real tool card's approval-before-UI transition. */
export function mountApprovalFixture() {
  const target = document.createElement("section");
  target.id = "mcp-approval-fixture";
  target.style.cssText = "position:fixed;right:24px;bottom:24px;width:420px;z-index:100";
  document.body.append(target);
  const instance = mount(McpAppApprovalFixture, {
    target,
    props: {
      name: "render_demo_app",
      args: "{}",
      result: undefined,
      expanded: false,
      argHint: "",
      onToggle: () => {},
      mcpUi: {
        descriptor: {
          server_id: "mcp-approval-fixture",
          tool_name: "render_demo_app",
          resource_uri: "ui://demo/app.html",
          visibility: ["model", "app"],
        },
        resource: {
          uri: "ui://demo/app.html",
          mime_type: "text/html;profile=mcp-app",
          text: "<!doctype html><html><body><p>Plugin tool completed.</p></body></html>",
        },
        arguments: {},
        content: [],
        is_error: false,
      },
    },
  });
  return Object.assign(
    async () => {
      await unmount(instance);
      target.remove();
    },
    { completeTool: (result = "Rendered") => instance.completeTool(result) },
  );
}
