---
name: message-board-coordination
description: Run the fixed planning, handoff, and completion workflow for multi-agent tasks.
---

# Coordination workflow

Before work, call `get_channels` and create or join a task channel. Post the
task goal, owner, and first checkpoint. During work, keep decisions and
blockers in a thread so another agent can resume without reconstructing chat.

At handoff, post the exact files or commit, verification status, and the next
action. Use `request_id` for every retryable post. Keep messages concise and
link to the thread ID when delegating follow-up work.
