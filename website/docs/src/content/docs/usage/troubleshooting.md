---
title: Common problems and troubleshooting
description: Diagnose model, workspace, attachment, permission, plugin, startup, and update problems without losing application data.
---

Start with the visible error and identify whether it belongs to resource preparation, a model request, a tool, or a plugin. Retry after correcting that boundary. Keep the task's actual error message and application version; avoid changing many settings at once.

## Cannot start or send a message

| Symptom | Check and next step |
| --- | --- |
| Initial resources do not finish | Check network/proxy access and the specific failed resource. Retry preparation or use the supported offline import/full bundle for the same platform |
| Release has no installer | A component-only release updates an existing app. Choose a release with a desktop installer |
| Send is disabled | Finish resource setup, enable a service with an available model, and choose a valid Chat binding; also wait for attachment saving or update activation |
| Connection test works but chat fails | Call the exact selected model. Check its entitlement, API mode, model/deployment ID, and required parameters |
| Authentication/401/403 error | Recheck the service credentials or supported login, account authorization, and endpoint; do not paste tokens into a support report |
| 404/model-not-found error | Check API root, API mode, and exact model/deployment identifier rather than the provider's display name |
| 429/rate-limit error | Read the provider's limit/quota response. Wait as directed, reduce concurrent requests, or select an available fallback |
| Timeout or repeated retries | Check the provider/network and retry queue. Stop the run if needed; retrying an invalid key or unsupported model does not repair it |
| Titles, compaction, or automatic checks fail | Test the separately configured Flash model and its fallback queue |

OpenAI-compatible is an API choice, not a promise that every service supports every optional parameter. Disable an inaccurately declared model capability, or use the appropriate model/API, when the service rejects image or reasoning fields.

## Files, attachments, and waiting tools

| Symptom | Check and next step |
| --- | --- |
| Agent works in the wrong folder | Check the active workspace and conversation. Reopen the existing project folder if it was moved or renamed |
| File or command access is denied | Inspect Agent → Execution & Permissions, path rules, read-only protected directories, and network policy. Approval does not expand these rules |
| Windows command reports sandbox setup failure | Complete the ordinary sandbox provisioning flow and check its helper error. Plugin installation cannot provision it; do not treat this as a provider failure |
| Image input is unavailable | Select a vision-capable model and enable its vision setting; a text-only model cannot read an image because it was attached |
| PDF uploads but has no desktop preview | PDF preview is intentionally unavailable. Reading still depends on the model/API; extract relevant text when that path is unsupported |
| Long pasted text becomes a file | Pastes over 1,000 Unicode characters become text attachments where supported; inspect the attachment/reference before sending |
| A task seems stuck | Look for a waiting approval, structured question, retry delay, active terminal, or plugin progress view before resubmitting |
| Stopping did not undo edits | Stop cancels future work. Review completed file changes and choose the appropriate file recovery action |

## Plugin and update problems

| Symptom | Check and next step |
| --- | --- |
| Installed plugin has no tools | Confirm enablement, component diagnostics, Direct/Relay override, role availability, configuration, and process prerequisites |
| Tool connects but the service is unusable | Complete the package's account authorization and call a primary service tool; setup/status alone is insufficient |
| Computer-control tools fail | Confirm the separate real-computer-access grant and supported OS/prerequisites; enabling a package does not grant access |
| Source edits are not visible | Use a local source-associated installation, Refresh, and wait for active tasks; invalid source preserves the old package |
| Panel disappears in another conversation | Check its workspace/conversation scope and workflow activation; views can be branch-specific |
| Update is waiting | Finish active Agent tasks first. A native-shell update needs restart; do not terminate work just to force replacement |
| Update fails offline or during verification | Retain the working installation, restore connectivity, and retry using the displayed recovery action; do not delete package data |

Plugin authors can use the more detailed [development troubleshooting table](../../plugins/local-development/#diagnose-by-boundary).

## Where is my history, and how do I back it up?

The ordinary installed app uses `~/.openagent/` on Windows, macOS, and Linux (`~` is your user home). Debug builds use `~/.openagent-dev/`, Alpha releases use `~/.openagent-alpha/`, and an explicit `OPENAGENT_HOME` selects another root. Check which installation/root you opened before concluding that history disappeared. Selecting another workspace or branch also changes the visible conversation.

The root contains configuration, `messages.db`, attachments, logs, installed packages, `plugin-data`, and private plugin settings. To make a manual backup, finish active work, **quit all OpenAgent windows/processes**, and copy the complete active root to a protected location. Copy workspace files and workspace `.agents/` separately. Copying only a live SQLite database can miss its committed WAL state.

Keep automatically reported migration/transition backups until the upgraded app and history are verified. If startup asks to back up and replace unsupported data, read the scope and backup destination before deciding. Do not delete `messages.db` or reset the data root to troubleshoot a connection. Reinstallation, package uninstall, and settings reset have different scopes; none is a substitute for a verified backup. Windows protected credentials are bound to the current user and are not a portable credential export.

## Report a reproducible problem

Open **Help → Report a problem** and describe the steps, expected result, actual result, OS/app version, and relevant service/plugin version. Confirmation uploads recent Runtime/desktop logs, which can contain error details and local paths. The optional current-conversation trace is **off by default**; enabling it can include saved messages, model requests/responses, and tool arguments/results. Review that choice before confirming upload.

The automatic diagnostic setting under **General → Privacy & diagnostics** is separate from this explicit report. Failed report uploads keep the draft for retry; retain a successful report ID when following up. Local logs are in the active root's `logs/`. Share the relevant bounded error rather than your whole configuration, credentials, or data directory.
