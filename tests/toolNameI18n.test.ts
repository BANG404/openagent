import { expect, test } from "bun:test";
import { toolNameKey } from "../src/lib/i18n";

test("localizes built-in tool names while preserving unknown tool names", () => {
  expect(toolNameKey("chat_group_start")).toBe("chatGroupStartTool");
  expect(toolNameKey("apply_patch")).toBe("toolApplyPatch");
  expect(toolNameKey("exec_command")).toBe("toolExecCommand");
  expect(toolNameKey("mcp_custom_tool")).toBeUndefined();
});
