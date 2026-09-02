# CoPet environments and verification scope

Documentation baseline: CoPet `v0.4.7`, 2 September 2026. This describes the
current Windows implementation, not a promise that every Codex client/version
has passed an end-to-end test.

## Support matrix

| Codex execution environment | CoPet status | Evidence and remaining checks |
|---|---|---|
| Desktop Local, Windows native | Primary supported path; exercised during development | Live native activity and UI were checked. Configuration, trust and delivery must still be checked on each installation; the two new session hooks have automated coverage but no confirmed live delivery in the current validation session. |
| Desktop Worktree, Windows native | Same local integration path; separate live validation pending | CoPet uses session/turn IDs, not the repository directory. Verify the worktree client's effective configuration and actual hook delivery. |
| VS Code extension, Windows native | Implemented integration; separate live validation pending | Windows runtime discovery and shared local ingress exist. The presence of an extension/runtime alone is not evidence that it loaded the intended configuration. |
| CLI, Windows native | Implemented integration; separate live validation pending | Uses the same hooks/notify/OTel contract. Requires a discoverable compatible Windows runtime and matching Codex home. |
| Desktop and VS Code simultaneously, Windows native | Multi-session reduction tested; live mixed-client validation pending | Session isolation and ambiguous-runtime diagnostics have automated coverage. CoPet does not claim which client produced a hook or choose VS Code as authoritative. |
| Agent running inside WSL, including a remote WSL IDE session | Not supported by current automatic setup | Windows hook commands, runtime discovery, Codex home and rollout access do not form a validated Linux-to-Windows integration. |
| Codex Cloud / ChatGPT Work Cloud / remote host | Not supported by the local receiver | Remote loopback is not the user's Windows computer. No remote delivery channel or relay is implemented. |

Local and Worktree execute on the user's computer; Cloud executes remotely.
This is an environment distinction, not a CoPet test result. See the official
[Codex environment modes](https://learn.chatgpt.com/docs/environments/modes).

## Windows prerequisites

- The packaged build targets `win-x64` and includes the .NET runtime. The
  application uses WinForms/user32; the project targets Windows 10 build 19041
  APIs. This is not a certification of every Windows 10/11 release or ARM64.
- Run CoPet and the Windows Codex agent as the intended user with the same
  resolved `CODEX_HOME` (default `%USERPROFILE%\.codex`). Setup manages only that
  profile's `config.toml` and `hooks.json`; it does not discover every profile.
- CoPet receives hooks, notify and OTLP/HTTP JSON on loopback port `9009`.
  Generated hooks require Windows `cmd.exe` and `curl.exe`. The notify command
  must point to an existing CoPet executable after an upgrade or move.
- Restart Codex after setup and personally review/trust new or changed hooks.
  There are eleven CoPet handlers. CoPet never grants trust automatically.
- Read-only rollout recovery watches the selected Codex home's `sessions`
  directory. Stop-button recovery depends on the exact turn's terminal record
  being written there and readable; it cannot read a remote client's journal.

The current implementation runs one CoPet instance on the fixed port. Multiple
clients can send to it, but only the selected Codex home is inspected and tailed.
Different profiles are not automatically configured or fully monitored.

## Configuration is not delivery

In **Connection diagnostics**, check these independently:

1. Exporter/notify configuration and all eleven hook definitions.
2. The hooks feature flag and trust. `Unknown` is not success.
3. HTTP, parsed and reducer-delivered counters, and each observed hook kind.
4. The produced/applied/painted snapshot sequences for UI delivery.

Runtime discovery inspects accessible Windows `codex.exe` processes and PATH
candidates. VS Code is identified by an extension-path pattern; other candidates
are labeled `Desktop / CLI`. This is a hint, not proven event-source identity.
With multiple candidates, trust remains ambiguous. With one candidate, the
read-only trust probe starts a separate short-lived `app-server` with CoPet's
Codex home; it does not interrogate the active chat process. OTel's reported
service/version and received session hooks are separate observations.

**Test local receiver** exercises HTTP, parsing and an isolated reducer without
changing the pet, timer or live counters. It cannot prove that a real client
loaded configuration, trusted hooks or sent an event. Zero HTTP requests means
only that no traffic was observed.

## Repeatable live check for each native client

Record the CoPet version, Windows build, client/runtime version, execution mode
and whether the intended Codex home matches; do not publish private paths or
payloads. Then:

1. Start CoPet before a fresh task. Inspect configuration/trust and run the
   isolated receiver test.
2. Submit a small task using one tool. Check `UserPromptSubmit`, `PreToolUse`,
   `PostToolUse`, the antenna and the timer. Retraction has a five-second grace
   after the last active tool ends; OTel must not close a hook-owned tool early.
3. Finish the task and check notify or rollout completion. In another task,
   use the stop button and verify that activity/timing stop without `DONE`.
4. When naturally available, check approval and compaction separately. Do not
   weaken permissions just to manufacture a test. Verify the amber/white lamp,
   ticker, and restoration of the current tool state.
5. Check a genuine session boundary separately from a turn. `SessionStart` and
   `SessionEnd` are diagnostic-only and must not start a timer or declare `DONE`.
6. For mixed clients, run overlapping tasks, then complete only one. Activity
   from the other must remain. Inspect safe session labels; do not infer client
   identity from the executable list alone.

Automated evidence is in `Config/CodexHooksManagerTests`,
`Config/CodexHookTrustProbeTests`, `Diagnostics/ReadinessInspectorTests`,
`Diagnostics/ReceiverDiagnosticsTests`, `Diagnostics/SessionDiagnosticsTests`,
`State/StateCoordinatorTests`, and the UI tests under `tests/CoPet.Tests`.
These simulate inputs and local HTTP; they do not certify real Worktree, IDE,
WSL or Cloud delivery. Unperformed live checks remain pending.

## WSL and Cloud limits — stage 12 deferred

Choosing WSL as an integrated terminal is not the same as running the agent in
WSL. The agent environment is configured separately. Windows-native and WSL
Codex also use different default home directories. See the official
[Windows app documentation](https://learn.chatgpt.com/docs/windows/windows-app).

CoPet does not install Linux hooks, discover the Linux runtime, map WSL profiles,
or validate WSL-to-Windows delivery. Pointing `CODEX_HOME` at a shared directory
alone is insufficient and may mix incompatible hook commands. A Windows-native
agent invoking `wsl.exe` is still a native-agent scenario, not proof of a WSL
agent integration.

Cloud or another computer cannot reach this CoPet through its own
`127.0.0.1:9009`. Do not expose the unauthenticated local monitoring receiver to
the Internet, open a firewall port, or treat missing cloud events as an idle task.
No relay, remote authentication or WSL transport is designed or implemented in
stage 11. Stage 12 is explicitly deferred.
