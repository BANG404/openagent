const imageExtensions = ["png", "jpg", "jpeg", "gif", "webp"] as const;
const documentExtensions = [
  "svg",
  "pdf",
  "txt",
  "md",
  "markdown",
  "rtf",
  "html",
  "htm",
  "css",
  "csv",
  "xml",
  "js",
  "jsx",
  "ts",
  "tsx",
  "py",
  "json",
  "yaml",
  "yml",
  "toml",
] as const;

const imageExtensionSet = new Set<string>(imageExtensions);
const documentExtensionSet = new Set<string>(documentExtensions);

export function selectableAttachmentExtensions(allowImages: boolean): string[] {
  return allowImages ? [...imageExtensions, ...documentExtensions] : [...documentExtensions];
}

export function attachmentNameSupported(name: string, allowImages: boolean): boolean {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return documentExtensionSet.has(extension) || (allowImages && imageExtensionSet.has(extension));
}
