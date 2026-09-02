# Troubleshooting

For supported clients and verification limits, see [Environments](ENVIRONMENTS.md)
(or `ENVIRONMENTS.txt` beside the executable in the release archive). Windows
native, a WSL agent and Cloud are not interchangeable. Current CoPet setup does
not support WSL/remote delivery; do not expose port `9009` to the Internet.

## CoPet does not react to Codex activity

Start with **right-click satellite > Connection diagnostics...** (or launch
with `--diagnostics`). **Refresh config / trust** checks configuration and all
detected runtime installations. `UNKNOWN` is not a successful trust check;
multiple runtimes are reported as ambiguous instead of silently choosing VS Code.
Use Codex `/hooks` to review trust yourself. The diagnostic window makes no
configuration changes.

**Test local receiver** checks actual loopback HTTP, parsing and isolated state
handling. A pass proves the local receiver works, not that Codex sends events.
The test does not affect the pet, timer or real-event counters. Live counters
pause while the report has focus; move focus to a button to resume updates.

- HTTP requests = 0: no traffic observed. CoPet cannot tell whether Codex did not
  send it or delivery failed before the receiver.
- HTTP > 0, parsed = 0: inspect request metadata, JSON format and event names.
- Parsed > 0, known OTel names = 0: inspect the bounded unknown-name list.
- Reducer failures > 0: ingestion succeeded but state handling/publishing failed.
- Reducer snapshot sequence persistently ahead of applied/painted: inspect UI
  dispatch/rendering. Small gaps are normal; unchanged or deduplicated events do
  not require a new frame.

Check `UserPromptSubmit`, `PreToolUse` and `PostToolUse` independently. Receiving
a lifecycle hook is not proof that tool hooks work. The report shows each hook's
first/last reception, and lists only safe OTel source metadata with hashed session
labels. Configuration validity, trust and observed delivery are separate facts.

1. Confirm that `CoPet.exe` is running and
   `%LOCALAPPDATA%\CoPet\settings.json` contains `"listen_port": 9009`.
2. Determine the Codex home used by both processes:

   ```powershell
   $env:CODEX_HOME
   ```

   An empty result means `%USERPROFILE%\.codex`. CoPet and Codex must resolve
   the same directory.
3. Check `<CODEX_HOME>\config.toml`. It needs an OTLP/HTTP exporter with:
   - endpoint `http://127.0.0.1:9009/v1/logs`;
   - protocol `json`.
4. The same file needs a root `notify` command containing the CoPet executable
   path followed by `--notify`. If another valid notify command already exists,
   `Apply setup` automatically chains it through `--forward`; the original
   command still receives the same JSON event. Dynamic/unparseable syntax is
   preserved and requires manual review.
5. Check `<CODEX_HOME>\hooks.json`. CoPet setup should have eleven handlers:
   `UserPromptSubmit`, `Stop`, `SubagentStart`, `SubagentStop`, `PreToolUse`,
   `PostToolUse`, `PermissionRequest`, `PreCompact`, `PostCompact`,
   `SessionStart`, and `SessionEnd`.
6. Restart Codex, open `/hooks`, and trust every new or changed CoPet handler.
   Untrusted command hooks are listed but skipped.
   A successful probe can report `LIFECYCLE HOOKS: TRUST REQUIRED`; select
   `Recheck trust` after approving all eleven handlers. The probe starts a
   separate runtime with the selected Codex home, not the active chat process.
   Multiple candidates remain ambiguous. CoPet never approves hooks automatically.
7. If hooks are present and trusted but never fire, check that Codex hooks have
   not been disabled with `[features] hooks = false`. CoPet reports this state
   as `LIFECYCLE HOOKS: DISABLED IN CONFIG` and does not override it silently.
8. Check `%LOCALAPPDATA%\CoPet\copet.log` for startup, parse, hook, notification,
   or state-transition warnings.

`/v1/traces` is not required. Adding a trace exporter will not improve state
tracking.

## CoPet starts reacting late

Fast turn start comes from `UserPromptSubmit` on `/v1/hooks`. Without that
trusted hook, CoPet falls back to OTLP logs, whose delivery can be batched.

The antenna opens on `PreToolUse`. A hook-owned tool stays active until its
matching `PostToolUse`; an early OTLP result cannot close it. After the final
tool ends, the antenna remains extended for `tool_retract_grace_ms` (5000 ms by
default) so nearby tool calls do not make it flap rapidly.

Relaunch CoPet and apply setup if it reports
`LIFECYCLE HOOKS: NEEDS SETUP`, restart Codex, and review the handlers in
`/hooks`.

## CoPet shows DONE while Codex is still working

OTLP `response.completed`, successful tool results, and `Stop` do not finish the
whole task. `DONE` requires an `agent-turn-complete` notification or the local
rollout `task_complete` fallback, no other
known or fallback session activity, no active subagents, and the
`done_quiet_ms` confirmation window.

If an early `DONE` still occurs, inspect `copet.log`. It records privacy-safe
short session/turn ids, the client source when available, and every visible
state transition reason. It never records prompts or assistant messages.

## CoPet remains active after Codex finished

The root normally remains active until `agent-turn-complete` or a definitive
local rollout boundary arrives. Confirm that the
root `notify` command points to the currently installed CoPet executable and
restart Codex after changing `config.toml`. A chained command appears after
`--forward` as an encoded argument; CoPet forwards the original event to it.
A stale executable path is the most likely cause after moving or replacing
`CoPet.exe`.

Setup also migrates Computer Use `--previous-notify` chains that contain an
older CoPet command. It preserves Computer Use and any unrelated secondary
notifier while leaving exactly one delivery to the current CoPet. Executable
names inside arbitrary arguments no longer make a foreign command CoPet-owned.
Malformed known chains are preserved and reported for manual review; keep the
backup before repairing them. A successful configuration check is not proof of
real Codex delivery: restart Codex and check the notify counter after a completed
turn. Versions through 0.4.4 require manual review of these nested chains.

CoPet also waits for active subagents. If a `SubagentStop` hook is missed, an
OTLP subagent result repairs the count and retires the child conversation. If
`Stop` arrives but the definitive notification is lost, the completion
candidate safely expires to `IDLE` after `idle_timeout_ms`. A hook-started turn
with no terminal signal stays active through ordinary model silence and uses
the much longer `lifecycle_abandon_timeout_ms` as crash recovery. CoPet never
guesses `DONE`.

Check `/hooks` and `copet.log`. After correcting hook delivery, restart CoPet to
clear its in-memory lifecycle tracker, then start a fresh Codex turn.

## Session lifecycle diagnostics

Setup installs eleven hooks, including `SessionStart` and `SessionEnd`. Review
the two new definitions in Codex `/hooks` after upgrading. They are observational
and return neutral JSON; they never approve tools or inject context.

The diagnostic report shows the last received session boundary, allowed source
and reason, reported model/permission mode and a hashed workspace label. Session
hooks need no `turn_id` and do not change the timer, tools, approval/compaction or
task journal. A `SessionStart` with `source=compact` does not replace `PostCompact`.
`SessionEnd` clears that session's diagnostic metadata, not its turn state; it
does not mean the last answer succeeded. It is not expected after every answer
or immediately when switching conversations. Missing observations are not proof
of a broken receiver; check configuration, trust and an actual session boundary.

## Understanding the activity ticker

The strip now shows a bounded, deterministic activity journal as well as approval
and compaction overlays. It can finish an unread result after the pet becomes
idle; this is recent history, not a sign that the timer or tool is still active.
Ordinary queued entries expire after 30 seconds, outcomes/errors after 90 seconds.
Repeated waiting messages aggregate as `xN`. A short `S-xxxxxx` hash distinguishes
sessions when recent history contains more than one source.

`RUNNING TOOL` is intentional for unknown or composite shell commands. CoPet does
not display raw commands or output. Test/build success requires a structured
`exit_code`; `TEST CALL FINISHED` does not claim that tests passed or a background
process ended. Permission and compaction messages still override this queue.

## Understanding the SUB lamps

- `SUB 0`: no tracked subagents are active.
- One to four active subagents light the four lamps from left to right.
- More than four agents light all four lamps; the number beside them remains
  exact.
- The main/root Codex agent is never included in the count.
- A new visible lamp uses two ignition frames and then remains steadily lit.

If CoPet starts in the middle of an existing turn, it cannot reconstruct hook or
OTLP start events emitted before it began listening. Start a new turn after
setup when validating the count.

## Codex setup files are in an unexpected directory

CoPet uses `CODEX_HOME` when it is set; otherwise it uses
`%USERPROFILE%\.codex`. Environment-variable changes only affect newly started
processes, so restart both CoPet and Codex after changing `CODEX_HOME`.

Expected files:

- `<CODEX_HOME>\config.toml`
- `<CODEX_HOME>\hooks.json`

## Restore a setup backup

When `Apply setup` changes an existing file, CoPet first creates a timestamped
backup beside it:

- `config.toml.bak-<timestamp>`
- `hooks.json.bak-<timestamp>`

Close Codex and CoPet, copy the chosen backup over the corresponding original,
then restart both programs. Preserve any newer unrelated settings manually if
you need them.

## hooks.json or config.toml is invalid

CoPet refuses to merge `hooks.json` when the root or required hook collections
have incompatible JSON types. If either setup file is malformed, restore a
known-good backup or repair the syntax, then relaunch CoPet and apply setup
again.

The hooks merge preserves unrelated JSON fields, events, and handlers, but JSON
formatting and comments can be normalized when the file is rewritten.

CoPet also refuses to rewrite `config.toml` or `hooks.json` when that path is a
symlink/reparse point. Update the managed target with its owning tool, or replace
the link only if that is your deliberate configuration-management choice.

## Proxy or VPN interferes with localhost telemetry

The generated lifecycle hook explicitly bypasses proxies for localhost. The
Codex OTLP exporter may still need a localhost bypass. If required by your
proxy setup, add `127.0.0.1,localhost` to its existing `NO_PROXY` list without
discarding other entries. Restart Codex and CoPet after changing environment
variables. Do not disable the proxy or firewall globally to test CoPet.

## Port 9009 is already in use

CoPet closes older `CoPet.exe` processes at startup, but it does not terminate
unrelated programs. Find the listener:

```powershell
Get-NetTCPConnection -LocalPort 9009 -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess
```

Stop or reconfigure the unrelated process, then relaunch CoPet. The current
CoPet build normalizes its port to `9009`.

## Verify the logs endpoint directly

With CoPet running:

```powershell
$payload = '{"resourceLogs":[{"resource":{"attributes":[]},"scopeLogs":[{"scope":{"name":"smoke","attributes":[]},"logRecords":[{"severityText":"INFO","attributes":[{"key":"event.name","value":{"stringValue":"codex.sse_event"}},{"key":"event.kind","value":{"stringValue":"response.in_progress"}}]}]}]}]}'
Invoke-WebRequest -Uri "http://127.0.0.1:9009/v1/logs" -Method Post -ContentType "application/json" -Body $payload
```

Expected response: `200 OK`. This manual request injects synthetic activity into
the live pet and counters; it does not prove that Codex loaded or trusted hooks.
Prefer **Test local receiver** above when you need a non-disruptive smoke test.

## SmartScreen warning on first run

For an unsigned build you trust, select `More info`, then `Run anyway`.
