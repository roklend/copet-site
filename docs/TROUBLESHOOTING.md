# Troubleshooting

## CoPet does not react to Codex activity

1. Verify `CoPet.exe` is running.
2. Verify CoPet listen port in `%LOCALAPPDATA%\CoPet\settings.json` is `9009`.
3. Check Codex OTLP endpoints in `%USERPROFILE%\.codex\config.toml`:
   - `http://127.0.0.1:9009/v1/logs`
   - `http://127.0.0.1:9009/v1/traces`
4. Confirm `protocol = "json"` for `otlp-http`.
5. Check local log: `%LOCALAPPDATA%\CoPet\copet.log`.

## Proxy or VPN blocks localhost telemetry

Set localhost bypass manually:

```powershell
setx NO_PROXY "127.0.0.1,localhost"
setx no_proxy "127.0.0.1,localhost"
```

Restart terminal and IDE after changing environment variables.

## SmartScreen warning on first run

For unsigned binaries this is expected:

1. Click `More info`
2. Click `Run anyway`

## Codex config became invalid

Restore latest backup next to `config.toml`:

- `%USERPROFILE%\.codex\config.toml.bak-<timestamp>`

Then relaunch CoPet and run onboarding again.

## Port already in use

CoPet uses fixed localhost port `9009`. Stop the process occupying `127.0.0.1:9009` and relaunch CoPet.

## Quick OTLP endpoint check

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:9009/v1/traces" -Method Post -ContentType "application/json" -Body "{}"
```

Expected result: HTTP `200 OK`.
