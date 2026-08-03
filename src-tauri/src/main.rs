// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    openagent_app::run_native_process_sandbox_helper_if_requested();
    openagent_lib::run()
}
