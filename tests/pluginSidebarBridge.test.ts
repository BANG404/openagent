import { expect, test } from "bun:test";
import {
  sidebarToolArguments,
  sidebarLinkUrl,
  sidebarToolRequest,
  type SidebarToolRequest,
} from "../src/lib/pluginSidebarBridge";

const request: SidebarToolRequest = {
  type: "openagent:sidebar-tool-call",
  version: 1,
  request_id: "read",
  scope: "conversation\u0000branch",
  tool_name: "chat_group_list",
  arguments: {},
};

test("sidebar requests require the current scope and bounded object arguments", () => {
  expect(sidebarToolRequest(request, request.scope)).toEqual(request);
  for (const bad of [
    { ...request, scope: "sibling" },
    { ...request, version: 2 },
    { ...request, arguments: [] },
    { ...request, request_id: "" },
    { ...request, arguments: { text: "x".repeat(65536) } },
  ])
    expect(sidebarToolRequest(bad, request.scope)).toBeNull();
});

test("sidebar links are bounded HTTP URLs scoped to the current document", () => {
  const link = {
    type: "openagent:sidebar-open-link",
    version: 1,
    scope: request.scope,
    url: "https://example.com",
  };
  expect(sidebarLinkUrl(link, request.scope)).toBe("https://example.com/");
  for (const bad of [
    { ...link, scope: "other" },
    { ...link, version: 2 },
    { ...link, url: "javascript:alert(1)" },
    { ...link, url: "file:///secret" },
    { ...link, url: "data:text/html,hi" },
    { ...link, url: "https://example.com/" + "a".repeat(4096) },
  ])
    expect(sidebarLinkUrl(bad, request.scope)).toBeNull();
});

test("frame arguments cannot replace host workspace, locale, or Agent sender context", () => {
  expect(
    sidebarToolArguments(
      {
        group_id: "group",
        content: "hello",
        workspace: "foreign",
        _openagent: { workspace: "foreign", conversation_id: "agent", locale: "en" },
      },
      "current",
      "zh",
    ),
  ).toEqual({
    group_id: "group",
    content: "hello",
    _openagent: { workspace: "current", locale: "zh", conversation_id: "", branch_id: "" },
  });
});
