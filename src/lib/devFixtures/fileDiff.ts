import type { FileChange } from "$lib/types";

export function fileDiffPreviewChanges(base: FileChange): FileChange[] {
  return [
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
    old_patch: `@@ -1,${source.split("\n").length} +1 @@\n${source
      .split("\n")
      .map((line) => `-${line}`)
      .join("\n")}\n+old value`,
  }));
}
