//! Bounded, content-addressed transfers shared by component installation.
use reqwest::{Client, Url};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub(crate) async fn bounded(client: &Client, url: &str, maximum: usize) -> Result<Vec<u8>, String> {
    let url = Url::parse(url).map_err(|error| error.to_string())?;
    if url.scheme() == "file" {
        let path = url
            .to_file_path()
            .map_err(|()| "Invalid local resource URL")?;
        let file = tokio::fs::File::open(path)
            .await
            .map_err(|error| error.to_string())?;
        let mut bytes = Vec::new();
        file.take(maximum as u64 + 1)
            .read_to_end(&mut bytes)
            .await
            .map_err(|error| error.to_string())?;
        if bytes.len() > maximum {
            return Err("Local resource exceeds its size limit".into());
        }
        return Ok(bytes);
    }
    let mut response = client
        .get(url)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?;
    if response
        .content_length()
        .is_some_and(|length| length > maximum as u64)
    {
        return Err("Resource exceeds its size limit".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|error| error.to_string())? {
        if bytes.len().saturating_add(chunk.len()) > maximum {
            return Err("Resource exceeds its size limit".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

pub(crate) async fn matches(path: &Path, size: u64, sha256: &str) -> Result<bool, String> {
    let Ok(mut file) = tokio::fs::File::open(path).await else {
        return Ok(false);
    };
    if file
        .metadata()
        .await
        .map_err(|error| error.to_string())?
        .len()
        != size
    {
        return Ok(false);
    }
    let mut hash = Sha256::new();
    let mut buffer = vec![0; 64 * 1024];
    loop {
        let count = file
            .read(&mut buffer)
            .await
            .map_err(|error| error.to_string())?;
        if count == 0 {
            break;
        }
        hash.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hash.finalize()) == sha256)
}

pub(crate) async fn artifact<F>(
    client: &Client,
    url: Url,
    cache: &Path,
    size: u64,
    sha256: &str,
    mut progress: F,
) -> Result<PathBuf, String>
where
    F: FnMut(u64, u64) + Send,
{
    if size == 0
        || size > 512 * 1024 * 1024
        || sha256.len() != 64
        || !sha256
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err("Invalid signed artifact bounds or digest".into());
    }
    tokio::fs::create_dir_all(cache)
        .await
        .map_err(|error| error.to_string())?;
    let destination = cache.join(sha256);
    if matches(&destination, size, sha256).await? {
        progress(size, size);
        return Ok(destination);
    }
    let partial = cache.join(format!("{sha256}.partial"));
    if matches(&partial, size, sha256).await? {
        let _ = tokio::fs::remove_file(&destination).await;
        tokio::fs::rename(&partial, &destination)
            .await
            .map_err(|error| error.to_string())?;
        progress(size, size);
        return Ok(destination);
    }
    if url.scheme() == "file" {
        let source = url
            .to_file_path()
            .map_err(|()| "Invalid offline artifact URL")?;
        if !matches(&source, size, sha256).await? {
            return Err("Offline artifact checksum mismatch".into());
        }
        tokio::fs::copy(source, &partial)
            .await
            .map_err(|error| error.to_string())?;
    } else {
        transfer_http(client, url, &partial, size, &mut progress).await?;
    }
    if !matches(&partial, size, sha256).await? {
        let _ = tokio::fs::remove_file(&partial).await;
        return Err("Downloaded resource checksum mismatch".into());
    }
    let _ = tokio::fs::remove_file(&destination).await;
    tokio::fs::rename(&partial, &destination)
        .await
        .map_err(|error| error.to_string())?;
    progress(size, size);
    Ok(destination)
}

async fn transfer_http<F>(
    client: &Client,
    url: Url,
    partial: &Path,
    size: u64,
    progress: &mut F,
) -> Result<(), String>
where
    F: FnMut(u64, u64) + Send,
{
    let mut offset = tokio::fs::metadata(&partial)
        .await
        .map(|meta| meta.len())
        .unwrap_or(0);
    if offset >= size {
        tokio::fs::remove_file(&partial)
            .await
            .map_err(|error| error.to_string())?;
        offset = 0;
    }
    let mut request = client.get(url).timeout(std::time::Duration::from_secs(900));
    if offset > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={offset}-"));
    }
    let mut response = request
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?;
    if response.status() == reqwest::StatusCode::PARTIAL_CONTENT {
        let expected = format!("bytes {offset}-{}/{size}", size - 1);
        if response
            .headers()
            .get(reqwest::header::CONTENT_RANGE)
            .and_then(|value| value.to_str().ok())
            != Some(expected.as_str())
        {
            return Err("Server returned an invalid resource resume range".into());
        }
    } else if response.status() == reqwest::StatusCode::OK {
        offset = 0;
    } else {
        return Err("Unexpected resource transfer status".into());
    }
    if response
        .content_length()
        .is_some_and(|length| length != size - offset)
    {
        return Err("Resource transfer length mismatch".into());
    }
    let mut output = tokio::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(offset == 0)
        .append(offset > 0)
        .open(&partial)
        .await
        .map_err(|error| error.to_string())?;
    progress(offset, size);
    while let Some(chunk) = response.chunk().await.map_err(|error| error.to_string())? {
        offset = offset
            .checked_add(chunk.len() as u64)
            .ok_or("Resource length overflow")?;
        if offset > size {
            return Err("Resource exceeds signed length".into());
        }
        output
            .write_all(&chunk)
            .await
            .map_err(|error| error.to_string())?;
        progress(offset, size);
    }
    output.sync_all().await.map_err(|error| error.to_string())?;
    if offset != size {
        return Err("Resource transfer is incomplete; retry will resume it".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn serve_response(response: &'static [u8]) -> (Url, tokio::task::JoinHandle<String>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = [0; 4096];
            let count = socket.read(&mut request).await.unwrap();
            socket.write_all(response).await.unwrap();
            String::from_utf8_lossy(&request[..count]).to_ascii_lowercase()
        });
        (
            Url::parse(&format!("http://{address}/artifact")).unwrap(),
            server,
        )
    }

    #[tokio::test]
    async fn resume_rejects_wrong_ranges_lengths_statuses_and_preserves_partial_bytes() {
        let fixture = tempfile::tempdir().unwrap();
        let payload = b"abcdefgh";
        let digest = format!("{:x}", Sha256::digest(payload));
        let partial = fixture.path().join(format!("{digest}.partial"));
        let cases: &[(&[u8], &str)] = &[
            (b"HTTP/1.1 206 Partial Content\r\nContent-Length: 5\r\nContent-Range: bytes 2-7/8\r\nConnection: close\r\n\r\ndefgh", "invalid resource resume range"),
            (b"HTTP/1.1 200 OK\r\nContent-Length: 7\r\nConnection: close\r\n\r\nabcdefg", "length mismatch"),
            (b"HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n", "Unexpected resource transfer status"),
            (b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", "404"),
        ];
        for &(response, expected) in cases {
            tokio::fs::write(&partial, &payload[..3]).await.unwrap();
            let (url, server) = serve_response(response).await;
            let error = artifact(&Client::new(), url, fixture.path(), 8, &digest, |_, _| {})
                .await
                .unwrap_err();
            assert!(
                error.contains(expected),
                "unexpected transfer failure: {error}"
            );
            assert!(server.await.unwrap().contains("range: bytes=3-"));
            assert_eq!(tokio::fs::read(&partial).await.unwrap(), &payload[..3]);
            assert!(!fixture.path().join(&digest).exists());
        }
    }

    #[tokio::test]
    async fn server_ignoring_range_restarts_download_without_appending() {
        let fixture = tempfile::tempdir().unwrap();
        let payload = b"abcdefgh";
        let digest = format!("{:x}", Sha256::digest(payload));
        tokio::fs::write(
            fixture.path().join(format!("{digest}.partial")),
            &payload[..3],
        )
        .await
        .unwrap();
        let (url, server) = serve_response(
            b"HTTP/1.1 200 OK\r\nContent-Length: 8\r\nConnection: close\r\n\r\nabcdefgh",
        )
        .await;
        let selected = artifact(&Client::new(), url, fixture.path(), 8, &digest, |_, _| {})
            .await
            .unwrap();
        assert!(server.await.unwrap().contains("range: bytes=3-"));
        assert_eq!(tokio::fs::read(selected).await.unwrap(), payload);
    }

    #[tokio::test]
    async fn corrupt_download_is_removed_and_a_clean_retry_repairs_the_cache() {
        let fixture = tempfile::tempdir().unwrap();
        let digest = format!("{:x}", Sha256::digest(b"abcdefgh"));
        let destination = fixture.path().join(&digest);
        tokio::fs::write(&destination, b"corrupt!").await.unwrap();
        let (url, server) = serve_response(
            b"HTTP/1.1 200 OK\r\nContent-Length: 8\r\nConnection: close\r\n\r\ncorrupt!",
        )
        .await;
        assert!(
            artifact(&Client::new(), url, fixture.path(), 8, &digest, |_, _| {})
                .await
                .unwrap_err()
                .contains("checksum mismatch")
        );
        server.await.unwrap();
        assert!(!fixture.path().join(format!("{digest}.partial")).exists());
        let (url, server) = serve_response(
            b"HTTP/1.1 200 OK\r\nContent-Length: 8\r\nConnection: close\r\n\r\nabcdefgh",
        )
        .await;
        assert_eq!(
            artifact(&Client::new(), url, fixture.path(), 8, &digest, |_, _| {})
                .await
                .unwrap(),
            destination
        );
        server.await.unwrap();
        assert_eq!(tokio::fs::read(&destination).await.unwrap(), b"abcdefgh");
    }

    #[tokio::test]
    async fn verified_completed_partial_recovers_without_network_after_interruption() {
        let fixture = tempfile::tempdir().unwrap();
        let digest = format!("{:x}", Sha256::digest(b"abcdefgh"));
        let partial = fixture.path().join(format!("{digest}.partial"));
        tokio::fs::write(&partial, b"abcdefgh").await.unwrap();
        let selected = artifact(
            &Client::new(),
            Url::parse("http://127.0.0.1:9/unavailable").unwrap(),
            fixture.path(),
            8,
            &digest,
            |_, _| {},
        )
        .await
        .unwrap();
        assert_eq!(tokio::fs::read(selected).await.unwrap(), b"abcdefgh");
        assert!(!partial.exists());
    }

    #[tokio::test]
    async fn interrupted_response_retains_received_bytes_and_resumes_on_retry() {
        let fixture = tempfile::tempdir().unwrap();
        let digest = format!("{:x}", Sha256::digest(b"abcdefgh"));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let (prefix_written, prefix_received) = tokio::sync::oneshot::channel();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = [0; 4096];
            socket.read(&mut request).await.unwrap();
            socket
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 8\r\nConnection: close\r\n\r\nabc")
                .await
                .unwrap();
            // Let the client consume and persist the prefix before injecting EOF.
            // Otherwise the HTTP decoder can report the truncated body first.
            tokio::time::timeout(std::time::Duration::from_secs(10), prefix_received)
                .await
                .expect("client did not persist the response prefix")
                .unwrap();
            socket.shutdown().await.unwrap();
            drop(socket);
            let (mut socket, _) = listener.accept().await.unwrap();
            let count = socket.read(&mut request).await.unwrap();
            assert!(String::from_utf8_lossy(&request[..count])
                .to_ascii_lowercase()
                .contains("range: bytes=3-"));
            socket.write_all(b"HTTP/1.1 206 Partial Content\r\nContent-Length: 5\r\nContent-Range: bytes 3-7/8\r\nConnection: close\r\n\r\ndefgh").await.unwrap();
        });
        let url = Url::parse(&format!("http://{address}/artifact")).unwrap();
        let client = Client::new();
        let mut prefix_written = Some(prefix_written);
        assert!(artifact(
            &client,
            url.clone(),
            fixture.path(),
            8,
            &digest,
            |received, _| {
                if received == 3 {
                    prefix_written.take().unwrap().send(()).unwrap();
                }
            }
        )
        .await
        .is_err());
        assert_eq!(
            tokio::fs::read(fixture.path().join(format!("{digest}.partial")))
                .await
                .unwrap(),
            b"abc"
        );
        assert!(!fixture.path().join(&digest).exists());
        let selected = artifact(&client, url, fixture.path(), 8, &digest, |_, _| {})
            .await
            .unwrap();
        server.await.unwrap();
        assert_eq!(tokio::fs::read(selected).await.unwrap(), b"abcdefgh");
    }
    #[tokio::test]
    async fn http_resume_checks_range_and_keeps_incomplete_bytes() {
        let fixture = tempfile::tempdir().unwrap();
        let cache = fixture.path().join("downloads");
        tokio::fs::create_dir(&cache).await.unwrap();
        let payload = b"complete artifact";
        let digest = format!("{:x}", Sha256::digest(payload));
        tokio::fs::write(cache.join(format!("{digest}.partial")), &payload[..5])
            .await
            .unwrap();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = [0; 4096];
            let count = socket.read(&mut request).await.unwrap();
            assert!(String::from_utf8_lossy(&request[..count])
                .to_ascii_lowercase()
                .contains("range: bytes=5-"));
            socket.write_all(b"HTTP/1.1 206 Partial Content\r\nContent-Length: 12\r\nContent-Range: bytes 5-16/17\r\nConnection: close\r\n\r\nete artifact").await.unwrap();
        });
        let result = artifact(
            &Client::new(),
            Url::parse(&format!("http://{address}/artifact")).unwrap(),
            &cache,
            17,
            &digest,
            |_, _| {},
        )
        .await
        .unwrap();
        server.await.unwrap();
        assert_eq!(tokio::fs::read(result).await.unwrap(), payload);
        let bad_url = Url::parse("http://127.0.0.1:9/unavailable").unwrap();
        let other_digest = "a".repeat(64);
        let partial = cache.join(format!("{other_digest}.partial"));
        tokio::fs::write(&partial, b"prefix").await.unwrap();
        assert!(artifact(
            &Client::new(),
            bad_url,
            &cache,
            17,
            &other_digest,
            |_, _| {}
        )
        .await
        .is_err());
        assert_eq!(tokio::fs::read(partial).await.unwrap(), b"prefix");
    }

    #[tokio::test]
    async fn offline_transfers_verify_and_reuse_without_source() {
        let fixture = tempfile::tempdir().unwrap();
        let source = fixture.path().join("source");
        tokio::fs::write(&source, b"verified resource")
            .await
            .unwrap();
        let url = Url::from_file_path(&source).unwrap();
        let digest = format!("{:x}", Sha256::digest(b"verified resource"));
        let cache = fixture.path().join("cache");
        let first = artifact(&Client::new(), url.clone(), &cache, 17, &digest, |_, _| {})
            .await
            .unwrap();
        tokio::fs::remove_file(source).await.unwrap();
        assert_eq!(
            artifact(&Client::new(), url, &cache, 17, &digest, |_, _| {})
                .await
                .unwrap(),
            first
        );
        assert!(artifact(
            &Client::new(),
            Url::parse("https://invalid.test/").unwrap(),
            &cache,
            17,
            "../escape",
            |_, _| {}
        )
        .await
        .is_err());
    }
}
