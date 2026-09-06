use base64::Engine as _;

pub async fn read_text_file(path: String) -> Result<String, String> {
    let path = std::path::PathBuf::from(path);
    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|error| format!("Failed to inspect file {}: {error}", path.display()))?;
    if !metadata.is_file() {
        return Err(format!("Not a file: {}", path.display()));
    }
    const MAX_TEXT_FILE_BYTES: u64 = 10 * 1024 * 1024;
    if metadata.len() > MAX_TEXT_FILE_BYTES {
        return Err(format!(
            "File is too large: {} bytes (max {MAX_TEXT_FILE_BYTES})",
            metadata.len()
        ));
    }
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|error| format!("Failed to read file {}: {error}", path.display()))
}

pub async fn save_download_file(
    filename: String,
    content: String,
    encoding: Option<String>,
) -> Result<String, String> {
    let directory = dirs::download_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| "Could not resolve Downloads directory".to_string())?;
    tokio::fs::create_dir_all(&directory)
        .await
        .map_err(|error| error.to_string())?;
    let safe_name = filename
        .chars()
        .map(|character| {
            if matches!(
                character,
                '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
            ) {
                '_'
            } else {
                character
            }
        })
        .collect::<String>();
    let (stem, extension) = match safe_name.rsplit_once('.') {
        Some((stem, extension)) => (stem.to_string(), format!(".{extension}")),
        None => (safe_name.clone(), String::new()),
    };
    let mut target = directory.join(&safe_name);
    let mut suffix = 1;
    while tokio::fs::try_exists(&target)
        .await
        .map_err(|error| error.to_string())?
    {
        target = directory.join(format!("{stem} ({suffix}){extension}"));
        suffix += 1;
    }
    let bytes = if encoding.as_deref() == Some("base64") {
        base64::engine::general_purpose::STANDARD
            .decode(content.as_bytes())
            .map_err(|error| format!("Base64 decode failed: {error}"))?
    } else {
        content.into_bytes()
    };
    tokio::fs::write(&target, bytes)
        .await
        .map_err(|error| error.to_string())?;
    Ok(target.to_string_lossy().into_owned())
}

pub fn system_locale() -> String {
    sys_locale::get_locale().unwrap_or_else(|| "zh-CN".to_string())
}

#[cfg(test)]
mod tests {
    use super::read_text_file;

    #[tokio::test]
    async fn rejects_directories_as_text_files() {
        let directory = tempfile::tempdir().unwrap();
        assert!(
            read_text_file(directory.path().to_string_lossy().into_owned())
                .await
                .unwrap_err()
                .starts_with("Not a file:")
        );
    }
}
