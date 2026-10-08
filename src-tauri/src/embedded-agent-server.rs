fn main() {
    #[cfg(feature = "embedded-runtime")]
    openagent_app::run_native_process_sandbox_helper_if_requested();
    openagent_lib::run_agent_server()
}
