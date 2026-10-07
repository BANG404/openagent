import { expect, test } from "bun:test";
import {
  sidebarToolArguments,
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
