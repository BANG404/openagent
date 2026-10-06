# Bundled embedding model

OpenAgent performs local semantic-memory retrieval with the dynamically
quantized `Xenova/all-MiniLM-L6-v2` ONNX model exposed by fastembed as
`AllMiniLML6V2Q`. The model remains a 384-dimensional MiniLM-L6-v2 encoder, so
existing vector storage keeps the same dimension and memories do not require a
schema migration.

The model, tokenizer metadata, and Apache-2.0 license are maintained under
`src-tauri/resources/models/all-MiniLM-L6-v2-q/` and published from an immutable
GitHub revision. They add approximately 23.7 MB to an uncompressed full bundle.
The ordinary Tauri build and every automatic updater artifact are lightweight;
the additional full first-install bundle carries these files as a seed.

Both routes install the verified model under
`<OPENAGENT_HOME>/resources/embedding/all-MiniLM-L6-v2-q/1/`. A full bundle
copies its seed, while a lightweight installation downloads the exact GitHub
files. Download or copy output stays in a staging directory until every size
and SHA-256 matches, then activates through an atomic directory rename. The
main window remains hidden while the resource is missing or corrupt. A
configured user enters only the setup window's resource-repair step rather than
repeating provider configuration.

The supervised `openagent-server` owns status inspection, seed installation or
download, verification, progress events, and loading the verified model into its
live Runtime. Tauri resolves an optional packaged seed path and proxies the typed
operations and Runtime events; preparing the resource does not drain or restart
the server. The explicit embedded debug mode retains a diagnostic host adapter
with the same operation and event contract.
The host's `embedding_adapter.rs` owns packaged seed discovery and embedded
command forwarding; `embedded_host.rs` contains the diagnostic Runtime host
bridge. Resource installation, verification, and activation stay in the SDK.

## Plugin inference

Installed, enabled, compatible plugins can call `embedding.status` and
`embedding.embed` over the existing package-authenticated Host Bridge. Plugin
Kit exposes `host.embedding.status()` and `host.embedding.embed(texts)`. Status
reports support/readiness, model identity, dimensions and request limits;
inference returns ordered finite vectors with the same identity. Older Runtimes
reject the optional status operation, which packages must handle separately from
a supported but not-ready model. This preserves plugin protocol 1.

The current local model returns 384-dimensional vectors. Requests allow 1..32
non-blank strings, up to 8192 UTF-8 bytes each and 65536 bytes total. The existing
tokenizer's truncation still applies; plugins should chunk long documents. One
plugin inference worker runs per Runtime, and concurrent calls return a busy
error for bounded retry. The bridge retains the worker slot through caller
cancellation and does not persist input or output.

Inference reuses the loaded Runtime encoder without downloading, repairing
resources, reading arbitrary host files or invoking remote providers. A missing
model returns a setup-required error through the existing host resource flow.
Packages own their indexes under `PLUGIN_DATA`; store the returned model id,
version and dimensions, and rebuild when identity changes. No additional computer
access grant is needed for local text inference.

## Reproducibility and verification

`bun run fetch:embedding-model` fetches the pinned Hugging Face revision and
rejects any file whose size or SHA-256 differs from the recorded manifest in
the script. `bun run check:embedding-model` performs the same validation
without network access.

Native CI checks the source resource hashes on Linux. Focused Rust tests load
the source files, install them through the same persistent-resource path, and
generate finite 384-dimensional vectors on Linux, Windows x64, and macOS arm64.
The embedding platform job also calls the authenticated plugin embedding
endpoint with real model files, checking authorization, ordered vectors and
bounded concurrency. Run the SDK's ignored plugin inference scenario locally
with `OPENAGENT_TEST_EMBEDDING_MODEL_DIR` pointing to these verified source files.
Release builds package the seed only in full first-install and Microsoft Store
artifacts; lightweight installers and updater metadata never reference it.

When replacing the model, keep its license beside the weights, pin an immutable
source revision and hashes, and update the platform inference test. A change of
embedding dimension or semantic model family also requires an explicit stored
vector migration; swapping files alone is not safe.
