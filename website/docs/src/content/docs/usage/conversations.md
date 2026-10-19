---
title: Conversations, files, and recovery
description: Give useful context, inspect tools and changes, handle waiting tasks, and explore conversation branches.
---

## Give the Agent a clear task

Open the intended workspace before starting a project conversation. Name the result, relevant files, constraints, and an observable success check. For example:

```text
Fix the empty-search behavior in this project. Read the search component and its tests, keep the existing visual style, and verify that clearing a query restores the full list. Show the files changed and the verification result.
```

The workspace makes project tools available; it does not automatically send every project file to the model. Ask the Agent to inspect the relevant files and check its tool results. Use project instructions and Skills for recurring requirements instead of pasting the whole repository into every turn.

Enter submits a message or chooses an open suggestion; Shift+Enter adds a line break. While the Agent runs, use the visible queue/steering controls according to whether the message should wait or guide current work. Stop cancels the active execution; a long-running task may instead be waiting for a question or approval.

## Attach and reuse context

Use the attachment action, drag files into the composer, or paste supported content. Inspect pending attachment cards before sending and remove anything unintended. Image input requires vision enabled for the **selected model**. PDF/document processing depends on its supported API; being uploadable does not guarantee that the model can read it. PDF is not embedded in the desktop preview.

The composer allows up to eight attachments, 20 MB each. Pasted text longer than 1,000 Unicode characters becomes a text attachment where attachment upload is supported. A file chip references that attachment; deleting its reference or preview removes it and renumbers the remaining references.

Select part of an assistant answer and choose **Add to chat** to quote it in the next request. Review the pending quote alongside your draft. This keeps the source relationship without rewriting your editable message.

## Read execution state

| What you see | What to do |
| --- | --- |
| Streaming answer or running tool | Follow progress; inspect a relevant card when needed |
| Approval request | Review the exact operation and arguments, then allow or deny |
| Structured question | Submit the requested answer through its form |
| Failed tool/model request | Read its error and correct the cause before retrying |
| Retry delay | Check the configured model retry queue; Stop if you want to cancel |

An approved call can still fail permissions or service validation. A tool card's proposed change is not proof that the change succeeded; inspect its result. The right-hand details panel brings together plugin workflow views, changed files, and terminals when available.

## Review edits and explore alternatives

Inspect changed-file content and diffs before accepting the result. Editing a previous user message or regenerating from it lets you explore another continuation. Keep track of the selected conversation branch: different branches can have different messages, active tasks, and plugin views.

Use the application's checkpoint/file recovery actions only after checking their stated scope. Conversation rollback and file rollback are different effects. They do not undo an email, provider-side change, or other external operation already completed by a tool. A project Git commit or backup remains useful before substantial edits.

Stopping a task prevents further execution but does not automatically undo completed file writes. After a failed or cancelled run, inspect the changed-file panel and resume with a concrete correction.

## Long conversations and reusable knowledge

Automatic context compaction summarizes model context for long conversations while preserving the visible history. Configure it under **Agent → Flash Tasks** and set a model's actual context window in its model configuration. If a configured window is present, the trigger is capped at 90% of that window. Compaction is not deletion of history and does not replace explicit task requirements.

Use the Memory surface for standing preferences and reusable knowledge. Global and workspace memory have different scopes. Automatic Agent-memory retrieval is off by default; configure it in Flash Tasks if needed. Context compression, saved memory, and a Skill's task instructions serve different purposes.

For timed continuation, ask the Agent to schedule it and show the pending hook, or ask it to list/cancel scheduled hooks. Goal, Graph, and Chat Groups add independently installed workflows; choose one only when its package behavior fits the task. See [models, permissions, and extensions](../configuration/) and [common problems](../troubleshooting/).
