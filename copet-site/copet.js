(() => {
  const FPS = 6;
  const FRAME_COUNT = 192;
  const FRAME_PREFIX = "render/output/x2/frame_";
  const FRAME_SUFFIX = ".png";

  const player = document.getElementById("frame-player");
  if (!player) {
    return;
  }

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const framePaths = Array.from({ length: FRAME_COUNT }, (_, index) => {
    return `${FRAME_PREFIX}${String(index + 1).padStart(4, "0")}${FRAME_SUFFIX}`;
  });

  const preloadImage = (src) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${src}`));
    image.src = src;
  });

  const preloadAll = () => Promise.all(framePaths.map(preloadImage));

  const setFrame = (index) => {
    const src = framePaths[index];
    if (player.dataset.frameSrc === src) {
      return;
    }

    player.dataset.frameSrc = src;
    player.src = src;
  };

  const startPlayback = () => {
    let frameIndex = 0;
    let lastTick = performance.now();
    const frameDuration = 1000 / FPS;

    const tick = (now) => {
      if (now - lastTick >= frameDuration) {
        const elapsedFrames = Math.floor((now - lastTick) / frameDuration);
        frameIndex = (frameIndex + elapsedFrames) % FRAME_COUNT;
        lastTick += elapsedFrames * frameDuration;
        setFrame(frameIndex);
      }

      window.requestAnimationFrame(tick);
    };

    setFrame(0);
    window.requestAnimationFrame(tick);
  };

  if (prefersReducedMotion) {
    setFrame(0);
    return;
  }

  preloadAll()
    .then(startPlayback)
    .catch((error) => {
      console.error(error);
      setFrame(0);
    });
})();
