# Bundled embedding model

OpenAgent performs local semantic-memory retrieval with the dynamically
quantized `Xenova/all-MiniLM-L6-v2` ONNX model exposed by fastembed as
`AllMiniLML6V2Q`. The model remains a 384-dimensional MiniLM-L6-v2 encoder, so
existing vector storage keeps the same dimension and memories do not require a
schema migration.

The model, tokenizer metadata, and Apache-2.0 license are release resources
under `src-tauri/resources/models/all-MiniLM-L6-v2-q/`. They add approximately
23.7 MB to an uncompressed application bundle. Desktop startup loads those
resources locally and never needs a first-run model download. If the resource
is missing, corrupt, or unsupported by the local ONNX runtime, semantic search
degrades to the existing keyword and time-based scoring instead of blocking
application startup.

## Reproducibility and verification

`bun run fetch:embedding-model` fetches the pinned Hugging Face revision and
rejects any file whose size or SHA-256 differs from the recorded manifest in
the script. `bun run check:embedding-model` performs the same validation
without network access.

Native CI checks the resource hashes on Linux. A focused Rust test loads the
packaged files, generates finite 384-dimensional vectors, and runs on Linux,
Windows x64, and macOS arm64. Release builds package the same resource directory
for Windows, Linux, macOS arm64, and macOS Intel.

When replacing the model, keep its license beside the weights, pin an immutable
source revision and hashes, and update the platform inference test. A change of
embedding dimension or semantic model family also requires an explicit stored
vector migration; swapping files alone is not safe.
