fn main() {
    if matches!(
        std::env::var("CARGO_CFG_TARGET_OS"),
        Ok(target) if target == "windows"
    ) {
        let source_path = std::path::PathBuf::from(
            std::env::var_os("OUT_DIR").expect("Cargo did not set OUT_DIR"),
        )
        .join("test-manifest.c");
        std::fs::write(
            &source_path,
            r#"#pragma comment(linker, "\"/manifestdependency:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'\"")
void openagent_link_windows_test_manifest(void) {}
"#,
        )
        .expect("failed to write the Windows test-manifest source");
        cc::Build::new()
            .file(source_path)
            .compile("openagent_test_manifest");
    }

    tauri_build::build()
}
