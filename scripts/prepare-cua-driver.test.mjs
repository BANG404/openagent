import { expect, test } from "bun:test";

import { CUA_DRIVER_VERSION, cuaDriverAsset, tauriTarget } from "./prepare-cua-driver.mjs";

test("maps supported Tauri platforms to Cua Driver release targets", () => {
  expect(tauriTarget("macos", "aarch64")).toBe("aarch64-apple-darwin");
  expect(tauriTarget("macos", "x86_64")).toBe("x86_64-apple-darwin");
  expect(tauriTarget("linux", "aarch64")).toBe("aarch64-unknown-linux-gnu");
  expect(tauriTarget("linux", "x86_64")).toBe("x86_64-unknown-linux-gnu");
  expect(tauriTarget("windows", "aarch64")).toBe("aarch64-pc-windows-msvc");
  expect(tauriTarget("windows", "x86_64")).toBe("x86_64-pc-windows-msvc");
  expect(tauriTarget("freebsd", "x86_64")).toBeUndefined();
});

test("pins every packaged Cua Driver asset and checksum", () => {
  const linux = cuaDriverAsset("x86_64-unknown-linux-gnu");
  expect(linux.name).toBe(`cua-driver-rs-${CUA_DRIVER_VERSION}-linux-x86_64-binary.tar.gz`);
  expect(linux.url).toContain(`/cua-driver-rs-v${CUA_DRIVER_VERSION}/`);
  expect(linux.sha256).toMatch(/^[0-9a-f]{64}$/);

  const windows = cuaDriverAsset("x86_64-pc-windows-msvc");
  expect(windows.name).toEndWith("-windows-x86_64-binary.zip");
  expect(windows.sha256).toMatch(/^[0-9a-f]{64}$/);
});

test("rejects unqualified Cua Driver targets", () => {
  expect(() => cuaDriverAsset("riscv64-unknown-linux-gnu")).toThrow(
    "Cua Driver has no pinned release asset",
  );
});
