//! Publication uses the same parser and signature checks as installed Runtime.
use anyhow::{bail, Context};
use openagent_app::compatibility_policy::{Policy, PolicySource};
use std::io::Read;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

fn read(path: &Path) -> anyhow::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    std::fs::File::open(path)?
        .take(256 * 1024 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > 256 * 1024 {
        bail!("Policy input exceeds size limit");
    }
    Ok(bytes)
}

fn verified(path: &Path) -> anyhow::Result<(Policy, Vec<u8>)> {
    let bytes = read(path)?;
    let signature = read(Path::new(&format!("{}.sig", path.display())))?;
    let policy =
        PolicySource::production().verify_document(&bytes, std::str::from_utf8(&signature)?)?;
    Ok((policy, bytes))
}

fn main() -> anyhow::Result<()> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let candidate = args
        .first()
        .context("Usage: compatibility-policy <candidate> [--unsigned | <previous>]")?;
    if args.len() > 2 {
        bail!("Unexpected compatibility policy arguments");
    }
    let unsigned = args.get(1).is_some_and(|v| v == "--unsigned");
    let (policy, bytes) = if unsigned {
        let bytes = read(Path::new(candidate))?;
        (Policy::parse(&bytes)?, bytes)
    } else {
        verified(Path::new(candidate))?
    };
    let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
    if policy.revision == 0 || !policy.is_current(now) {
        bail!("Published policy must have a positive revision and be currently valid");
    }
    if let Some(previous) = args.get(1).filter(|_| !unsigned) {
        let (old, old_bytes) = verified(Path::new(previous))?;
        if policy.revision < old.revision || (policy.revision == old.revision && bytes != old_bytes)
        {
            bail!("Policy revision must advance; a published revision is immutable");
        }
    }
    println!(
        "{}",
        serde_json::json!({"revision":policy.revision,"issued_at":policy.issued_at,"expires_at":policy.expires_at})
    );
    Ok(())
}
