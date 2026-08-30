(() => {
  const FPS = 6;
  const FRAME_DURATION = 1000 / FPS;
  const FRAME_PREFIX = "render/output/base/frame_";
  const FRAME_SUFFIX = ".png?v=0.4.3";
  const PRELOAD_BATCH_SIZE = 8;
  const STATIC_FRAME = 48;

  const player = document.getElementById("frame-player");
  const viewport = document.getElementById("demo-viewport");

  if (!player || !viewport) {
    return;
  }

  const range = (start, end) => {
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  };

  const story = [
    ...range(33, 40),
    ...range(45, 60),
    ...range(89, 112),
    ...range(129, 144),
  ];

  const framePath = (frame) => {
    return `${FRAME_PREFIX}${String(frame).padStart(4, "0")}${FRAME_SUFFIX}`;
  };

  const loadedFrames = new Set();
  const preloadFrame = (frame) => {
    if (loadedFrames.has(frame)) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const image = new Image();
      const finish = () => {
        loadedFrames.add(frame);
        resolve();
      };
      image.onload = finish;
      image.onerror = finish;
      image.src = framePath(frame);
    });
  };

  const preloadBatch = (startIndex) => {
    const batch = story.slice(startIndex, startIndex + PRELOAD_BATCH_SIZE);
    return Promise.all(batch.map(preloadFrame));
  };

  const schedulePreloads = (startIndex) => {
    if (startIndex >= story.length) {
      return;
    }

    const schedule = window.requestIdleCallback
      ? (callback) => window.requestIdleCallback(callback, { timeout: 1200 })
      : (callback) => window.setTimeout(callback, 180);

    schedule(() => {
      preloadBatch(startIndex).finally(() => {
        schedulePreloads(startIndex + PRELOAD_BATCH_SIZE);
      });
    });
  };

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let storyIndex = 0;
  let animationFrame = null;
  let lastTick = 0;
  let isVisible = true;
  let initialBatchReady = false;

  const renderFrame = (frame) => {
    const src = framePath(frame);
    if (player.dataset.frameSrc !== src) {
      player.dataset.frameSrc = src;
      player.src = src;
    }
  };

  const shouldAnimate = () => {
    return initialBatchReady
      && !motionQuery.matches
      && isVisible
      && document.visibilityState === "visible";
  };

  const stopPlayback = () => {
    if (animationFrame !== null) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  };

  const tick = (now) => {
    if (!shouldAnimate()) {
      stopPlayback();
      return;
    }

    if (!lastTick) {
      lastTick = now;
    }

    if (now - lastTick >= FRAME_DURATION) {
      const elapsedFrames = Math.floor((now - lastTick) / FRAME_DURATION);
      storyIndex = (storyIndex + elapsedFrames) % story.length;
      lastTick += elapsedFrames * FRAME_DURATION;
      renderFrame(story[storyIndex]);
      preloadFrame(story[(storyIndex + 1) % story.length]);
    }

    animationFrame = window.requestAnimationFrame(tick);
  };

  const startPlayback = () => {
    if (animationFrame !== null || !shouldAnimate()) {
      return;
    }

    lastTick = performance.now();
    animationFrame = window.requestAnimationFrame(tick);
  };

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      isVisible = entries.some((entry) => entry.isIntersecting);
      if (isVisible) {
        startPlayback();
      } else {
        stopPlayback();
      }
    }, { threshold: 0.1 });
    observer.observe(viewport);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      startPlayback();
    } else {
      stopPlayback();
    }
  });

  const handleMotionPreference = () => {
    if (motionQuery.matches) {
      stopPlayback();
      renderFrame(STATIC_FRAME);
    } else {
      startPlayback();
    }
  };

  motionQuery.addEventListener?.("change", handleMotionPreference);
  renderFrame(STATIC_FRAME);

  if (!motionQuery.matches) {
    preloadBatch(0).finally(() => {
      initialBatchReady = true;
      renderFrame(story[0]);
      startPlayback();
      schedulePreloads(PRELOAD_BATCH_SIZE);
    });
  }
})();
