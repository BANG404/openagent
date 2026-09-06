# Attachments and editing

Image attachments are offered by the composer only when the selected model's
visual multimodality setting is enabled. Text and document attachments remain
available independently; the runtime enforces the same model capability when
building the provider request.

- Text selected inside an assistant answer exposes one compact, localized
  `Add to chat` floating action. Adding it creates a structured `quote` context
  tied to the source assistant message, moves focus to the shared composer, and
  leaves the editable draft text unchanged. Render pending quotes above the
  textarea with an explicit remove action; queue, submit, restore, branch edit,
  and remote-gateway flows must preserve the same typed context. Render durable
  quotes above the user-authored message text, shrink their cards to the visible
  excerpt up to the available message width, and keep their provider wrapper out
  of the visible transcript. Pending composer quote rows continue to fill the
  composer width. Preserve selected KaTeX expressions as Markdown math from the
  renderer-owned source wrapper instead of copying its visual layout spans, and
  render that math in pending and durable quote cards.
- Keep pending composer text, attachments, and quoted context isolated by
  conversation while navigating. The new-conversation surface owns a separate
  draft per workspace and role; sending or deleting one conversation must not
  clear another conversation's pending composer state. Write the active reactive
  draft back to its keyed store before swapping the composer to another draft;
  retaining only the pre-proxy source object loses edits made through bindings.
  Synchronize the single-row textarea's measured height on mount, before the
  first edit. Start every measurement from its CSS minimum instead of `auto`,
  then clamp the content height to that minimum so an empty restored draft and
  its first typed character cannot resize or move the composer across browser
  engines.
- Reuse one attachment preview component in composer and restored transcript.
- Open attachment previews in the same full-window visual frame used by rich
  Mermaid and book previews: center the attachment within the framed canvas and
  keep preview controls in the top-right. Image previews expose zoom out, fit,
  zoom in, and close controls; text and unavailable states retain the same
  centered frame and close placement. Gate opening through an explicit extension
  whitelist so unsupported formats remain non-previewable. Reset every image
  preview to fit whenever it opens; toolbar and pointer-anchored wheel zoom share
  the same bounded scale, and enlarged image content scrolls inside the frame
  instead of clipping. Lightweight text previews retain normal scrolling and do
  not expose zoom controls or intercept the wheel. PDF remains uploadable but is
  excluded from the preview whitelist and must never be embedded in the WebView.
- In the ordinary composer, render pending attachments as 112px preview cards in
  one horizontally scrollable row: preview image and supported text content,
  keep the filename anchored at the card foot, and keep the remove action at
  the top-right. Quick chat retains its 28px single-line attachment strip
  because its native window height is fixed.
- Keep editable user messages discoverable without adding a second action
  target: the message bubble retains its accessible edit label and reveals a
  non-interactive pencil affordance on pointer hover or keyboard focus.
- Pair edit and regenerate actions with the nearest preceding user-authored
  message in transcript order, skipping tagged compaction replays. Do not
  require projected checkpoint IDs to match: a complete selected-tip snapshot
  stamps historical user records with the tip while Turn metadata can retain
  the assistant record's owning checkpoint.
- Paint durable, editable, and loading-skeleton user-message bubbles with the
  shared `--user-message-bg` token, which maps to the fixed theme-aware
  `--component-neutral-bg` used by assistant-rendered cards. Keep that component
  surface gray in both themes and visually distinct from the conversation canvas.
  Use that fill for every attachment-card variant as well. Keep user-input
  cards and summaries in their compact transparent grammar, and keep grouped
  tool calls on the transcript canvas: the summary is its own outlined button and
  expanded ordinary tool cards retain transparent backgrounds without a shared
  group background or enclosing perimeter.
- Collapse long user-message text by a fixed number of complete rendered lines
  on an inner content layer. Keep bubble padding outside the clamp so changing
  type metrics cannot expose or crop a partial trailing line. Apply preserved
  whitespace only to that content layer so template spacing around it cannot
  create leading or trailing blank lines.
- Restored previews load blob bytes on demand. Do not embed bytes in checkpoint
  IPC payloads.
- Removing a restored attachment is a staged edit: cancel restores it; send
  creates a new branch and preserves the original.
- Repair an app-managed pasted attachment only by checkpoint SHA-256 match.
  Missing external-file blobs require reselecting the original file and
  verifying the same SHA-256.
