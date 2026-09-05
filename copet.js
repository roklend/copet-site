(() => {
  const setup = document.getElementById('setup');
  document.getElementById('setup-link')?.addEventListener('click', () => {
    setup.open = true;
  });
  if (setup && window.location?.hash === '#setup') setup.open = true;
  const player = document.getElementById('frame-player');
  const viewport = document.getElementById('demo-viewport');
  const toggle = document.getElementById('play-toggle');
  const state = document.getElementById('demo-state');
  const note = document.getElementById('demo-note');
  if (!player || !viewport || !toggle) return;
  const root = 'assets/demo-v049/';
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let playing = !motion.matches;
  let ready = false;
  let visible = true;
  let index = 0;
  let lastTick = 0;
  let raf = null;
  let manifest;
  let images = new Map();
  let failed = false;
  const label = (frame) => frame < 12 || frame >= 124 ? 'Ready for the next turn'
    : frame < 20 ? 'Unfolding' : frame < 28 ? 'Thinking'
    : frame < 44 ? 'Three subagents at work' : frame < 76 ? 'Using tools'
    : frame < 92 ? 'Thinking' : frame < 106 ? 'Turn complete'
    : frame < 114 ? 'Folding back up' : 'Done. All folded up.';
  function render() {
    const frame = manifest.playback[index];
    player.src = images.get(frame).src;
    player.dataset.frame = String(frame);
    state.textContent = label(frame);
  }
  function sync() {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    toggle.textContent = failed ? 'Retry' : !ready ? 'Loading…' : playing ? 'Pause' : 'Play';
    toggle.setAttribute('aria-label', failed ? 'Retry loading animation' : playing ? 'Pause animation' : 'Play animation');
    toggle.disabled = !ready && !failed;
    if (ready && playing && visible && document.visibilityState === 'visible') {
      lastTick = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }
  function tick(now) {
    if (now - lastTick >= 1000 / manifest.fps) {
      // Never catch up by skipping transition frames after a slow render.
      index = (index + 1) % manifest.playback.length;
      lastTick = now;
      render();
    }
    raf = requestAnimationFrame(tick);
  }
  async function load() {
    failed = false;
    ready = false;
    sync();
    try {
      const response = await fetch(`${root}manifest.json`);
      if (!response.ok) throw new Error('Manifest unavailable');
      manifest = await response.json();
      const frames = [...new Set(manifest.playback)];
      const loaded = new Map();
      let cursor = 0;
      await Promise.all(Array.from({ length: 6 }, async () => {
        while (cursor < frames.length) {
          const frame = frames[cursor++];
          const image = new Image();
          image.src = root + manifest.frames[frame].file;
          await image.decode();
          loaded.set(frame, image);
        }
      }));
      images = loaded;
      index = 0;
      ready = true;
      render();
      note.textContent = 'Actual CoPet 0.4.9 rendering · Synthetic session data';
    } catch {
      failed = true;
      state.textContent = 'Animation unavailable';
      note.textContent = 'The download still works. Retry to load the demo.';
    }
    sync();
  }
  toggle.addEventListener('click', () => {
    if (failed) { load(); return; }
    playing = !playing;
    sync();
  });
  motion.addEventListener('change', () => { playing = !motion.matches; sync(); });
  document.addEventListener('visibilitychange', sync);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      sync();
    }, { threshold: 0.1 }).observe(viewport);
  }
  load();
})();
