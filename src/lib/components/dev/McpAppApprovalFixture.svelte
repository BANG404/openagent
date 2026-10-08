<script lang="ts">
  import { Tooltip } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import ToolCallCard from "../ToolCallCard.svelte";
  const props: ComponentProps<typeof ToolCallCard> = $props();
  let approvalState = $state<"pending" | "answered">("pending");
  let toolResult = $state<string | undefined>();
  export function completeTool(result: string) {
    toolResult = result;
  }
</script>

<Tooltip.Provider>
  <ToolCallCard
    {...props}
    result={toolResult}
    approval={{
      state: approvalState,
      request: {
        request_id: "initial-tool-review",
        conv_id: null,
        kind: "tool_approval",
        fields: [],
      },
    }}
    onApprove={() => (approvalState = "answered")}
    onDeny={() => {
      approvalState = "answered";
      toolResult = "Tool call was denied by the user";
    }}
  />
</Tooltip.Provider>
