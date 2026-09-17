// @ts-nocheck -- Bun provides the test module at runtime.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const updater = readFileSync("src/lib/appUpdater.ts", "utf8");
const route = readFileSync("src/routes/+page.svelte", "utf8");
const clientHooks = readFileSync("src/hooks.client.ts", "utf8");
const host = readFileSync("src-tauri/src/lib.rs", "utf8");
const hostResources = readFileSync("src-tauri/src/frontend_resource.rs", "utf8");

test("production update checks stage and activate a verified frontend resource", () => {
  expect(updater).toContain('invoke<PreparedFrontendResource>("prepare_frontend_resource")');
  expect(updater).toContain('invoke<void>("activate_frontend_resource"');
  expect(updater).toContain('translate("updateComponentFrontend")');
  expect(updater).toContain("current_version: string");
  expect(updater).toContain('translate("frontendUpdateInProgressDescription")');
  expect(updater).toContain("if (import.meta.env.DEV) return null");
  expect(updater).toContain("RESOURCE_UPDATE_PREPARE_TIMEOUT_MS");
});

test("production update checks aggregate Runtime and Shell updates", () => {
  expect(updater).toContain('invoke<PreparedRuntimeResource>("prepare_runtime_resource")');
  expect(updater).toContain('invoke("activate_runtime_resource"');
  expect(updater).toContain('translate("updateComponentRuntime")');
  expect(updater).toContain('translate("updateComponentShell")');
  expect(updater).toContain("shell.currentVersion");
  expect(updater).toContain("formatComponentVersionTransitions");
  expect(updater).toContain('title: translate("updateAvailable")');
  expect(updater).toContain("const shellDownload = shell ? downloadShellUpdate(shell) : null");
  expect(updater).not.toContain("installShellUpdate");
  expect(updater).not.toContain("downloadAndInstall");
  expect(updater).toContain('translate("updateAll")');
  expect(updater).toContain('invoke<ComponentUpdateGate>("begin_component_update")');
  expect(updater).toContain('invoke("end_component_update")');
  expect(updater).toContain('translate("updateDeferredActiveAgent")');
});

test("versioned WebViews confirm activation through the host handshake", () => {
  expect(clientHooks).toContain('get("frontend-version")');
  expect(clientHooks).toContain('invoke("confirm_frontend_activation"');
  expect(clientHooks).toContain("confirmFrontendActivationWithRetry");
  expect(clientHooks).toContain('reportComponentUpdateEvent("frontend", "confirmation_started"');
  expect(route).toContain("frontendActivationShouldShowNotice");
  expect(updater).toContain("if (!updates.frontend)");
  expect(host).toContain("rollback_pending(&candidate_version).await");
  expect(host).toContain("Duration::from_secs(15)");
  expect(host).toContain('"http://openagent-ui.localhost/"');
  expect(host).toContain('"openagent-ui://localhost/"');
  // An in-process activation and a startup continuation share one deadline
  // helper and are told apart only by the stage they pass to it.
  expect(host).toContain('"confirmation_timed_out",');
  expect(host).toContain("manager.rollback_pending(&version).await");
});

test("a pending frontend activation survives the process that armed it", () => {
  // The shell installer ends the host process inside `install()`, so a frontend
  // activation is routinely left pending. Rolling it back at startup is what
  // re-offered the update on the next launch.
  expect(hostResources).toContain('stage = "pending_confirmation_restored"');
  expect(hostResources).not.toContain(
    "rolling back a frontend activation left pending by the previous process",
  );
  expect(hostResources).toContain("active.pending_confirmation || active.version != version");
  expect(host).toContain("startup_frontend_manager.pending_confirmation_version()");
  expect(host).toContain('"startup_confirmation_timed_out"');
  expect(host).toContain("arm_frontend_confirmation_deadline(");

  // The startup deadline is armed after the windows it expects to confirm exist.
  expect(host.indexOf("startup_frontend_manager.pending_confirmation_version()")).toBeLessThan(
    host.indexOf('"startup_confirmation_timed_out"'),
  );
});

test("components activate in the documented order within one barrier", () => {
  const order = [
    'invoke<ComponentUpdateGate>("begin_component_update")',
    'invoke("activate_runtime_resource"',
    'invoke<void>("activate_frontend_resource"',
    'invoke<boolean>("begin_shell_install")',
    "await shell.install()",
    'invoke("restart_app")',
  ].map((step) => {
    const at = updater.indexOf(step);
    expect(at).toBeGreaterThanOrEqual(0);
    return at;
  });
  expect(order).toEqual([...order].sort((left, right) => left - right));
});

test("the shell installer runs after the host has prepared the exit", () => {
  // `install()` ends the process on Windows, so every step that depends on
  // this host being alive has to precede it.
  const prepared = updater.indexOf('await invoke<boolean>("begin_shell_install")');
  const install = updater.indexOf("await shell.install()");
  expect(prepared).toBeGreaterThanOrEqual(0);
  expect(install).toBeGreaterThan(prepared);

  expect(updater).toContain("shellInstallPrepared = true");
  expect(updater).toContain("if (shellInstallPrepared) {");
  expect(updater).toContain("!frontendActivationCommitted && !shellInstallPrepared");

  // An unready Runtime defers before anything is torn down.
  expect(updater.indexOf("if (!prepared) {")).toBeLessThan(install);
  expect(updater.indexOf("if (!prepared) {")).toBeGreaterThan(
    updater.indexOf('"begin_shell_install"'),
  );

  expect(host).toContain("async fn begin_shell_install(");
  expect(host).toContain('stage = "install_prepared"');
  expect(host).toContain("acquire_component_update_barrier(updates.inner(), supervisor.inner())");

  // Preparation does the bounded teardown and never restarts anything.
  const begin = host.indexOf("async fn begin_shell_install(");
  expect(begin).toBeGreaterThanOrEqual(0);
  const command = host.slice(begin, host.indexOf("\n}\n", begin) + 2);
  expect(command).toContain("stop_desktop_children(&app).await");
  expect(command).toContain("hide_desktop_surfaces(&app)");
  expect(command).not.toContain("request_desktop_exit");

  // The exit that follows completes the prepared work instead of repeating it.
  expect(host).toContain("DesktopExitStep::Complete");
  expect(host).toContain("advance_desktop_exit_phase()");
  expect(host).toContain("DesktopExitPhase::ShellInstallPrepared");
});

test("component lifecycle diagnostics cover shell, Runtime, and frontend stages", () => {
  expect(updater).toContain('reportComponentUpdateEvent("shell", "check_started")');
  expect(updater).toContain('reportComponentUpdateEvent("shell", "download_started"');
  expect(updater).toContain('reportComponentUpdateEvent("shell", "install_started"');
  expect(host).toContain('component = "runtime"');
  expect(host).toContain('stage = "activation_finished"');
  expect(host).toContain('component = "frontend"');
  expect(host).toContain('stage = "confirmation_finished"');
  expect(host).toContain('"openagent-host.jsonl"');
});

test("component activation waits for active agents without cancelling them", () => {
  expect(host).toContain("drain_supervised_runtime(supervisor.inner(), false)");
  expect(host).not.toContain('body: Some("{\\"cancel\\":true}".to_string())');
  expect(host).toContain('path: "/api/desktop/resume".to_string()');
  expect(host).toContain("frontend activation requires an active component update barrier");
});
