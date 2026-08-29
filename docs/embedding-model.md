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

## Reproducibility and verification

`bun run fetch:embedding-model` fetches the pinned Hugging Face revision and
rejects any file whose size or SHA-256 differs from the recorded manifest in
the script. `bun run check:embedding-model` performs the same validation
without network access.

Native CI checks the source resource hashes on Linux. Focused Rust tests load
the source files, install them through the same persistent-resource path, and
generate finite 384-dimensional vectors on Linux, Windows x64, and macOS arm64.
Release builds package the seed only in full first-install and Microsoft Store
artifacts; lightweight installers and updater metadata never reference it.

When replacing the model, keep its license beside the weights, pin an immutable
source revision and hashes, and update the platform inference test. A change of
embedding dimension or semantic model family also requires an explicit stored
vector migration; swapping files alone is not safe.
