# Langfuse package ownership

This unpublished local package owns external observability configuration,
public hook collection, OTLP conversion and bounded pending telemetry.
Use the host's `openagent-plugin-development` and `deliver-via-owt` skills.
Never extend internal SDK telemetry access implicitly. Do not add this candidate
to published source/release indices before an independent repository is authorized.

Keep upload, message capture and tool-content capture off by default. Message
projection requires the declared Runtime capability and its independently saved
consent field; never infer permission from tool capture. Configuration is supplied
through private plugin bindings; do not read ambient credentials or host settings.
Hook stdout stays empty. Tests use fake credentials and loopback mock ingestion.
Run the Plugin Kit validator with all platform locales and package-owned tests.
Do not replace mock success with a claim of authenticated Langfuse readiness.
