# Domain Glossary (`antigravity-shinobu-theme` -> Rust)

| Original Term (JS) | Meaning | Rust Name (Type / Module / Function) |
| --- | --- | --- |
| `theme_payload.js` / Master IIFE | Bundled browser payload wrapped with lexical `__AGY_BOOT__` secret closure | `build_payload::compile_payload` |
| `EPHEMERAL_TOKEN` | 256-bit random hex secret generated per daemon boot for API/binding auth | `security::EphemeralToken` |
| `DANGEROUS_KEYS` | Prototype-pollution keys (`__proto__`, `constructor`, `prototype`, etc.) stripped from JSON | `security::strip_dangerous_keys` |
| `workspaceProfiles` | Per-workspace visual & persona overrides stored in `theme_config.json` | `config::WorkspaceProfile` / `persona_sync::sanitize_workspace_profiles_strict` |
| `syncPersonaRuntimeHint` | Atomic synchronization of active Hashira persona state & runtime hints | `persona_sync::sync_persona_runtime_hint` |
| `AGY_PERSONA_SHIFT` | PreInvocation hook system directive injected on persona/mode transitions | `hooks::pre_invocation::build_persona_shift_directive` |
| `Incremental Transcript Tailer` | Byte-offset JSONL reader streaming live token/subagent/skill events over SSE | `daemon::tailer::TranscriptTailer` |
| `CDP Target Probe` | Chrome DevTools Protocol WebSocket target filter + live DOM probe before injection | `daemon::cdp::CdpInjector` |
| `Clean Edition` | Pure-MIT export stripped of anime fan-art assets with generated neutral wallpapers | `cli_ops::clean_export::export_clean_edition` |
