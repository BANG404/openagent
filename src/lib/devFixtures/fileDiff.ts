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
    old_patch: `@@ -1,${source.split("\n").length} +1 @@\n${source
      .split("\n")
      .map((line) => `-${line}`)
      .join("\n")}\n+old value`,
  }));
  const text = new TextEncoder().encode("one\r\nTWO\r\nthree\r\nFOUR\r\n");
  const raw = (bytes: Uint8Array) => [
    40,
    181,
    47,
    253,
    32,
    bytes.length,
    ((bytes.length << 3) | 1) & 255,
    bytes.length >> 5,
    0,
    ...bytes,
  ];
  const long = Array.from({ length: 100 }, (_, index) => `recorded line ${index + 1}`).join("\n");
  return [
    ...projected,
    {
      ...base,
      id: "long-snapshot",
      path: "long.txt",
      projection: {
        kind: "edited",
        available: true,
        change_ids: ["long-snapshot"],
        content: long,
        diff: "",
      },
    },
    {
      ...base,
      id: "raw-snapshot",
      path: "recorded.txt",
      projection: undefined,
      old_patch: "@@ -2 +2 @@\n-TWO\n+two",
      new_content_z: raw(text),
    },
    {
      ...base,
      id: "empty-snapshot",
      path: "empty.txt",
      projection: undefined,
      old_patch: "reverse",
      new_content_z: raw(new Uint8Array()),
    },
    {
      ...base,
      id: "deleted-snapshot",
      path: "deleted.txt",
      projection: {
        kind: "deleted",
        available: true,
        change_ids: ["deleted-snapshot"],
        content: null,
        diff: "",
      },
    },
    {
      ...base,
      id: "unavailable-snapshot",
      path: "unavailable.txt",
      projection: undefined,
      old_patch: "reverse",
      new_content_z: [1, 2, 3],
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
    old_patch: "@@ -1 +1 @@\n-shared surface\n+old surface",
    old_content_z: null,
    new_content_z: null,
    new_hash: null,
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
    old_patch:
      "@@ -238,2 +238,5 @@\n-          <FileChangeBanner changes={view.fileChanges} />\n+          <MessageInput\n+            bind:value={composerDraft.text}\n             disabled={!view.tauriAvailable}",
    old_content_z: null,
    new_content_z: null,
    new_hash: null,
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
    old_patch: null,
    old_content_z: null,
    new_content_z: [40, 181, 47, 253, 32, 4, 33, 0, 0, 97, 10, 98, 10],
    new_hash: null,
    seq: 3,
    created_at: 3,
  },
];
