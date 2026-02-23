/*
Internal notes from CoPet source (C:\CoPet\src):
- State machine states: IDLE, THINKING, EDITING, AWAITING_APPROVAL, TOOL_RUNNING, DONE, ERROR.
- Key event triggers:
  - THINKING on response.in_progress / output_text.delta / reasoning_summary.
  - EDITING on response.function_call_arguments.
  - AWAITING_APPROVAL on response.function_call_arguments.done.
  - TOOL_RUNNING on codex.tool_decision decision=approved.
  - DONE on response.completed and on codex.tool_result success=true.
  - ERROR on tool_decision denied, tool_result success=false, api status >=400, SeverityText ERROR.
- UI animation in app uses loops idle/thinking/tool + transitions; no dedicated DONE sprite.
- HUD in app shows raw state, THINK/TOOL/ERR counters, and elapsed TIME.
- Telemetry parser fields include: event.name, event.kind, tool_name, decision, success, status code, severity.
*/

(function bootstrapSimulator() {
  const STATES = {
    IDLE: "idle",
    THINK: "think",
    TOOL: "tool",
    DONE: "done",
    ERROR: "error",
  };

  const TOOLS = [
    "functions.shell_command",
    "functions.apply_patch",
    "functions.search_query",
    "functions.finance",
  ];

  const THINK_EVENTS = [
    "response.in_progress",
    "output_text.delta",
    "reasoning_summary",
    "response.function_call_arguments",
  ];

  const TOOL_EVENTS = [
    "codex.tool_decision approved",
    "codex.tool_result success=true",
  ];

  const ERROR_EVENTS = [
    "codex.tool_result success=false",
    "codex.api_request 429",
    "SeverityText ERROR",
  ];

  const DURATION_RANGES_MS = {
    idle: [2000, 4000],
    think: [4000, 7000],
    tool: [3000, 6000],
    done: [2000, 3000],
    error: [2000, 3000],
  };

  const TELEMETRY_INTERVAL_RANGE_MS = [220, 460];

  const sim = document.getElementById("sim");
  const playPauseBtn = document.getElementById("playPauseBtn");
  const restartBtn = document.getElementById("restartBtn");
  const speedButtons = Array.from(document.querySelectorAll(".btn-speed"));
  const downloadLink = document.getElementById("download-link");
  const fields = collectFields();

  let currentState = STATES.IDLE;
  let speed = 1;
  let playing = true;
  let stateTimerId = null;
  let telemetryTimerId = null;
  let sessionStartedAt = Date.now();
  let currentTool = "-";

  const counters = {
    tokens: 0,
    think: 0,
    tool: 0,
    error: 0,
  };

  setRepoLinks();
  setState(STATES.IDLE, "init");
  scheduleNextState();

  playPauseBtn.addEventListener("click", onPlayPause);
  restartBtn.addEventListener("click", onRestart);
  speedButtons.forEach((button) => {
    button.addEventListener("click", () => setSpeed(Number(button.dataset.speed)));
  });

  function collectFields() {
    const byName = {};
    document.querySelectorAll("[data-field]").forEach((node) => {
      byName[node.dataset.field] = node;
    });
    return byName;
  }

  function setRepoLinks() {
    const owner = detectOwner();
    const repo = "copet-site";
    const latest = `https://github.com/${owner}/${repo}/releases/latest`;
    const troubleshooting = `https://github.com/${owner}/${repo}/blob/main/docs/TROUBLESHOOTING.md`;
    if (downloadLink) {
      downloadLink.href = latest;
    }
    document.querySelectorAll('a[href$="releases/latest"]').forEach((a) => {
      a.href = latest;
    });
    document.querySelectorAll('a[href="docs/TROUBLESHOOTING.md"]').forEach((a) => {
      a.href = troubleshooting;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    });
  }

  function detectOwner() {
    if (window.location.hostname.endsWith(".github.io")) {
      return window.location.hostname.split(".")[0];
    }
    return "roklend";
  }

  function onPlayPause() {
    playing = !playing;
    playPauseBtn.textContent = playing ? "Pause" : "Play";
    if (!playing) {
      clearStateTimer();
      clearTelemetryTimer();
      return;
    }
    scheduleNextState();
    syncTelemetryLoop();
  }

  function onRestart() {
    clearStateTimer();
    clearTelemetryTimer();

    counters.tokens = 0;
    counters.think = 0;
    counters.tool = 0;
    counters.error = 0;
    currentTool = "-";
    sessionStartedAt = Date.now();

    setState(STATES.IDLE, "restart");
    if (playing) {
      scheduleNextState();
    }
  }

  function setSpeed(nextSpeed) {
    if (![1, 2, 4].includes(nextSpeed)) {
      return;
    }
    speed = nextSpeed;
    sim.dataset.speed = String(nextSpeed);
    speedButtons.forEach((button) => {
      button.classList.toggle("is-active", Number(button.dataset.speed) === nextSpeed);
    });
    if (playing) {
      scheduleNextState();
      syncTelemetryLoop();
    }
  }

  function scheduleNextState() {
    clearStateTimer();
    if (!playing) {
      return;
    }

    const next = nextStateFor(currentState);
    const duration = randomMs(DURATION_RANGES_MS[currentState]);
    const scaledDuration = Math.max(180, Math.round(duration / speed));

    stateTimerId = window.setTimeout(() => {
      setState(next, "autoplay");
      scheduleNextState();
    }, scaledDuration);
  }

  function nextStateFor(state) {
    switch (state) {
      case STATES.IDLE:
        return STATES.THINK;
      case STATES.THINK:
        return STATES.TOOL;
      case STATES.TOOL:
        return Math.random() < 0.2 ? STATES.ERROR : STATES.DONE;
      case STATES.DONE:
      case STATES.ERROR:
      default:
        return STATES.IDLE;
    }
  }

  function setState(next, reason) {
    currentState = next;
    applyStateClass(next);
    updateCountersOnStateEnter(next);
    updateTelemetry(reason);
    syncTelemetryLoop();
  }

  function applyStateClass(state) {
    sim.classList.remove(
      "state-idle",
      "state-think",
      "state-tool",
      "state-done",
      "state-error"
    );
    sim.classList.add(`state-${state}`);
  }

  function updateCountersOnStateEnter(state) {
    if (state === STATES.THINK) {
      counters.think += 1;
    } else if (state === STATES.TOOL) {
      counters.tool += 1;
      currentTool = pick(TOOLS);
    } else if (state === STATES.ERROR) {
      counters.error += 1;
    } else if (state === STATES.IDLE) {
      currentTool = "-";
    }
  }

  function syncTelemetryLoop() {
    clearTelemetryTimer();
    if (!playing) {
      return;
    }
    if (currentState !== STATES.THINK && currentState !== STATES.TOOL) {
      return;
    }

    const tick = () => {
      if (!playing) {
        return;
      }
      if (currentState !== STATES.THINK && currentState !== STATES.TOOL) {
        return;
      }

      if (currentState === STATES.THINK) {
        counters.tokens += randomInt(14, 42);
      } else {
        counters.tokens += randomInt(6, 23);
      }

      updateTelemetry("tick");

      const nextInterval = Math.max(
        200,
        Math.round(randomMs(TELEMETRY_INTERVAL_RANGE_MS) / speed)
      );
      telemetryTimerId = window.setTimeout(tick, nextInterval);
    };

    telemetryTimerId = window.setTimeout(
      tick,
      Math.max(200, Math.round(randomMs(TELEMETRY_INTERVAL_RANGE_MS) / speed))
    );
  }

  function updateTelemetry(reason) {
    fields.status.textContent = rawStateFrom(currentState);
    fields.event.textContent = eventFor(currentState);
    fields.tool.textContent = currentState === STATES.TOOL ? currentTool : "-";
    fields.tokens.textContent = String(counters.tokens);
    fields.elapsed.textContent = formatElapsed(Date.now() - sessionStartedAt);
    fields.port.textContent = "9009";
    fields.think.textContent = String(counters.think);
    fields.toolCount.textContent = String(counters.tool);
    fields.errorCount.textContent = String(counters.error);

    if (reason === "restart") {
      fields.event.textContent = "restart";
    }
  }

  function rawStateFrom(state) {
    switch (state) {
      case STATES.THINK:
        return pick(["THINKING", "EDITING", "AWAITING_APPROVAL"]);
      case STATES.TOOL:
        return "TOOL_RUNNING";
      case STATES.DONE:
        return "DONE";
      case STATES.ERROR:
        return "ERROR";
      case STATES.IDLE:
      default:
        return "IDLE";
    }
  }

  function eventFor(state) {
    switch (state) {
      case STATES.THINK:
        return pick(THINK_EVENTS);
      case STATES.TOOL:
        return pick(TOOL_EVENTS);
      case STATES.DONE:
        return "response.completed";
      case STATES.ERROR:
        return pick(ERROR_EVENTS);
      case STATES.IDLE:
      default:
        return "idle_timeout";
    }
  }

  function clearStateTimer() {
    if (stateTimerId !== null) {
      window.clearTimeout(stateTimerId);
      stateTimerId = null;
    }
  }

  function clearTelemetryTimer() {
    if (telemetryTimerId !== null) {
      window.clearTimeout(telemetryTimerId);
      telemetryTimerId = null;
    }
  }

  function randomMs(range) {
    return randomInt(range[0], range[1]);
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function pick(values) {
    return values[Math.floor(Math.random() * values.length)];
  }

  function formatElapsed(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
})();
