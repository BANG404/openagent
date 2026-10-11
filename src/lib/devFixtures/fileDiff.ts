import type { FileChange } from "$lib/types";

export function fileDiffPreviewChanges(base: FileChange): FileChange[] {
  const projected: FileChange[] = [
    {
      path: "sample.ts",
      source: 'const message: string = "你好";\n/* comment\ncontinued */\nconsole.log(message);',
    },
    { path: "sample.py", source: 'def greet(name):\n    return "你好 " + name' },
    { path: "sample.ps1", source: '$message = "你好"\nWrite-Output $message' },
    { path: "sample.unknown", source: '<script>alert("raw text")</script>\n```literal fences```' },
  ].map(({ path, source }, index) => ({
    ...base,
    id: `code-${index}`,
    path,
    projection: {
      kind: "edited",
      change_ids: [`code-${index}`],
      available: true,
      content: source,
      diff: `@@ -1 +1,${source.split("\n").length} @@\n-old value\n${source
        .split("\n")
        .map((line) => `+${line}`)
        .join("\n")}\n`,
    },
  }));
  const long = Array.from({ length: 100 }, (_, index) =>
    index === 0 ? `\t${"long recorded source ".repeat(30)}END` : `recorded line ${index + 1}`,
  ).join("\n");
  return [
    ...projected,
    {
      ...base,
      id: "long-content",
      path: "long.txt",
      projection: {
        kind: "edited",
        available: true,
        change_ids: ["long-content"],
        content: long,
        diff: "",
      },
    },
    {
      ...base,
      id: "inferred-edit",
      path: "recorded.txt",
      projection: {
        kind: "edited",
        available: true,
        complete: true,
        change_ids: ["inferred-edit"],
        content: "one\r\nTWO\r\nthree\r\nFOUR\r\n",
        diff: "@@ -2 +2 @@\n-two\n+TWO\n",
      },
    },
    {
      ...base,
      id: "empty-content",
      path: "empty.txt",
      projection: {
        kind: "edited",
        available: true,
        complete: true,
        change_ids: ["empty"],
        content: "",
        diff: null,
      },
    },
    {
      ...base,
      id: "deleted-content",
      path: "deleted.txt",
      projection: {
        kind: "deleted",
        available: true,
        change_ids: ["deleted-content"],
        content: null,
        diff: "",
      },
    },
    {
      ...base,
      id: "unavailable-content",
      path: "unavailable.txt",
      projection: {
        kind: "edited",
        available: false,
        complete: false,
        change_ids: ["unavailable"],
        content: null,
        diff: null,
      },
    },
    {
      ...base,
      id: "fragment-edit",
      path: "fragment.txt",
      projection: {
        kind: "edited",
        available: true,
        complete: false,
        change_ids: ["fragment"],
        content: null,
        diff: "@@ -1 +1 @@\n-old fragment\n+new fragment\n",
      },
    },
  ];
}

export const checkpointPanelChanges: FileChange[] = [
  {
    projection: {
      kind: "edited",
      change_ids: ["preview-file-change"],
      available: true,
      content: "shared surface\n",
      diff: "@@ -1 +1 @@\n-old surface\n+shared surface\n",
    },
    id: "preview-file-change",
    conv_id: "input-surfaces-preview",
    checkpoint_id: "preview-checkpoint",
    path: "src/lib/components/MessageInput.svelte",
    operation: "write",
    seq: 1,
    created_at: 1,
  },
  {
    projection: {
      kind: "edited",
      change_ids: ["preview-file-change-two"],
      available: true,
      content:
        "          <MessageInput\n            bind:value={composerDraft.text}\n             disabled={!view.tauriAvailable}\n",
      diff: "@@ -238,2 +238,3 @@\n-          <FileChangeBanner changes={view.fileChanges} />\n+          <MessageInput\n+            bind:value={composerDraft.text}\n              disabled={!view.tauriAvailable}\n",
    },
    id: "preview-file-change-two",
    conv_id: "input-surfaces-preview",
    checkpoint_id: "preview-checkpoint",
    path: "src/lib/components/ConversationSurface.svelte",
    operation: "write",
    seq: 2,
    created_at: 2,
  },
  {
    projection: {
      kind: "created",
      change_ids: ["preview-file-change-three"],
      available: true,
      content: "a\nb\n",
      diff: "@@ -0,0 +1,2 @@\n+a\n+b\n",
    },
    id: "preview-file-change-three",
    conv_id: "input-surfaces-preview",
    checkpoint_id: "preview-checkpoint",
    path: "docs/conversation-details.md",
    operation: "write",
    seq: 3,
    created_at: 3,
  },
];
