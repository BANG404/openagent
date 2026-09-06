### Microsoft Store package

Stable releases also stage and submit one unsigned x64 MSIX through Partner
Center. Beta releases do not submit a Store package. The Store layout must
mirror the Windows desktop bundle's runtime inputs: the main executable, the
agent-server executable, release-root DLLs, and the bundled embedding model.
The packaging step fails before submission when a required staged resource is
missing. Store package versions are independent from the WiX installer version:
Stable SemVer `X.Y.Z` maps to `(X+1).Y.Z.0`. This keeps the required fourth
component at zero, avoids a forbidden zero first component during `0.x`
development, and remains monotonic across later Stable releases.

The native ONNX Runtime used by local semantic retrieval dynamically links the
Visual C++ 14 runtime. Every generated `Package.appxmanifest` therefore declares
`Microsoft.VCLibs.140.00.UWPDesktop` as a framework dependency. Do not assume a
review machine already has `MSVCP140.dll`, copy an arbitrary DLL downloaded
from the internet, or rely on Partner Center to infer this dependency. The
Store installs and services the declared framework package together with both
the first published package and all later updates.

For a rejected first submission, keep the existing Partner Center product and
identity, build a higher four-part MSIX version through the normal Stable
release workflow, and replace the failed submission package. Do not create a
second Store product or change the reserved package identity. Before submitting
manually, inspect `Package.appxmanifest` in the staged layout and confirm the
VCLibs package dependency is present.

The target repository must define the `OPENAGENT_CI_REPORTER_APP_ID` variable
and the `OPENAGENT_CI_REPORTER_PRIVATE_KEY`, `OPENAGENT_SDK_RELEASE_TOKEN`,
and `TAURI_SIGNING_PRIVATE_KEY` secrets. The SDK release token needs workflow
and release access only to the private SDK repository. Release validates these
credentials before tagging or starting platform builds; secret values are never
printed.
Runtime, frontend, and development channel manifests are signed with the Tauri signer. Its
detached `.sig` artifact is the Tauri-standard Base64 wrapper around minisign
text; desktop resource installers decode that wrapper, verify the exact
downloaded manifest bytes against the updater public key, and only then fetch
or activate the referenced artifact. The release workflow passes the validated
passwordless private key and an explicit empty password to every standalone
manifest-signing command, rather than depending on environment-variable
discovery or an interactive password prompt. Local integration tests use an
ephemeral test keypair and never require the production private key.

The Release workflow first runs all frontend, Rust, embedding, sandbox, and
Harness qualification, then performs the authoritative product compilation for
the exact release SHA on every supported target and promotes those same
artifacts without rebuilding them. Each platform matrix entry compiles the
lightweight Tauri application once, then uses the existing compiled outputs to
bundle the full first-install variant without rerunning `beforeBuildCommand`.
Each platform matrix entry exports a
dedicated Runtime sidecar target while the native and full bundles run. This
target takes precedence over Tauri's host-oriented environment variables, so
cross-compilation prepares the target-named sidecar instead of the runner
host's sidecar.
