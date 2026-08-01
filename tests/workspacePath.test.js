// @ts-nocheck -- Bun provides the test module at runtime.
import { describe, expect, test } from "bun:test";
import { isWslWorkspacePath, workspaceFolderName } from "../src/lib/workspacePath";

describe("workspaceFolderName", () => {
  test("extracts a Windows workspace folder", () => {
    expect(workspaceFolderName("C:\\Users\\dev\\OpenMontage")).toBe("OpenMontage");
  });

  test("extracts a folder from a slash path with a trailing separator", () => {
    expect(workspaceFolderName("/Users/dev/OpenMontage/")).toBe("OpenMontage");
  });

  test("uses the requested fallback when there is no folder name", () => {
    expect(workspaceFolderName(null, "Workspace")).toBe("Workspace");
    expect(workspaceFolderName("/", "Workspace")).toBe("Workspace");
  });
});

describe("isWslWorkspacePath", () => {
  test("recognizes standard and extended WSL shares", () => {
    expect(isWslWorkspacePath("\\\\wsl.localhost\\Ubuntu\\home\\dev\\openagent")).toBe(true);
    expect(isWslWorkspacePath("\\\\wsl$\\Ubuntu\\home\\dev\\openagent")).toBe(true);
    expect(isWslWorkspacePath("\\\\?\\UNC\\wsl.localhost\\Ubuntu\\home\\dev\\openagent")).toBe(
      true,
    );
  });

  test("does not mark local Windows paths as WSL", () => {
    expect(isWslWorkspacePath("C:\\Users\\dev\\openagent")).toBe(false);
  });
});
