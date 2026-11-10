/**
 * @fileoverview Main Application Orchestrator for Quantum-Orbital-Renderer.
 * Connects the UI Controls, Web Worker Monte Carlo Sampler, Three.js 3D Point Cloud,
 * 2D Radial P(r) Histogram Canvas, URL Hash State, and Automated FPS Benchmark.
 */

import { MAX_N } from './physics/radial.js';
import { computeAdaptiveRMax } from './physics/sampler.js';
import { COLOR_MODES } from './render/colors.js';
import { createOrbitalScene } from './render/scene.js';
import { drawRadialPlot } from './ui/radial-plot.js';
import { createControlsUI } from './ui/controls.js';

/**
 * Parses URL hash parameters (e.g., "#n=3&l=2&m=0&real=1&points=120000") into a validated state object.
 * Pure helper exported for Node.js unit testing.
 *
 * @param {string} hashStr - Window location.hash string.
 * @param {object} [defaults={}] - Fallback state values.
 * @returns {object} Sanitized orbital application state.
 */
export function parseHashState(hashStr, defaults = {}) {
  const base = {
    n: 3,
    l: 2,
    m: 0,
    useReal: true,
    pointCount: 120000,
    pointSize: 0.18,
    colorMode: COLOR_MODES[0],
    autoRotate: true,
    slicePlane: false,
    ...defaults,
  };

  if (!hashStr || typeof hashStr !== 'string') {
    return base;
  }

  const cleaned = hashStr.startsWith('#') ? hashStr.slice(1) : hashStr;
  const params = new URLSearchParams(cleaned);

  if (params.has('n')) {
    const nVal = Number.parseInt(params.get('n'), 10);
    if (Number.isInteger(nVal) && nVal >= 1 && nVal <= MAX_N) {
      base.n = nVal;
    }
  }
  if (params.has('l')) {
    const lVal = Number.parseInt(params.get('l'), 10);
    if (Number.isInteger(lVal) && lVal >= 0 && lVal < base.n) {
      base.l = lVal;
    }
  }
  if (base.l >= base.n) {
    base.l = base.n - 1;
  }

  if (params.has('m')) {
    const mVal = Number.parseInt(params.get('m'), 10);
    if (Number.isInteger(mVal) && Math.abs(mVal) <= base.l) {
      base.m = mVal;
    }
  }
  if (Math.abs(base.m) > base.l) {
    base.m = 0;
  }

  if (params.has('real')) {
    base.useReal = params.get('real') !== '0' && params.get('real') !== 'false';
  }

  if (params.has('points')) {
    const pts = Number.parseInt(params.get('points'), 10);
    if (Number.isInteger(pts) && pts >= 10000 && pts <= 500000) {
      base.pointCount = pts;
    }
  }

  return base;
}

/**
 * Serializes the current quantum orbital state into a compact URL hash string.
 * Pure helper exported for Node.js unit testing.
 *
 * @param {object} state - Current orbital state ({ n, l, m, useReal, pointCount }).
 * @returns {string} Hash string starting with '#' (e.g. "#n=3&l=2&m=0&real=1&points=120000").
 */
export function serializeHashState(state) {
  const realFlag = state.useReal ? 1 : 0;
  return `#n=${state.n}&l=${state.l}&m=${state.m}&real=${realFlag}&points=${state.pointCount}`;
}

/**
 * Bootstraps the browser application when running in a DOM environment.
 */
async function initBrowserApp() {
  const orbitalCanvas = document.getElementById('orbital-canvas');
  const controlsEl = document.getElementById('controls-panel');
  const statsEl = document.getElementById('orbital-stats');
  const perfEl = document.getElementById('perf-panel');
  const radialCanvas = document.getElementById('radial-plot');

  if (!orbitalCanvas || !controlsEl || !statsEl || !perfEl) {
    return;
  }

  // Parse initial state from URL hash (defaults to 3d_z^2 orbital: n=3, l=2, m=0, 120k points)
  let appState = parseHashState(window.location.hash);

  // Initialize the Three.js 3D point-cloud scene
  const scene = await createOrbitalScene(orbitalCanvas, {
    maxPoints: 500000,
    initialPointSize: appState.pointSize,
  });

  // Pre-allocate a Float32Array on the main thread to accumulate streamed radii for the 2D histogram
  const allRadiiBuffer = new Float32Array(500000);
  let accumulatedRadiiCount = 0;
  let runningRadiusSum = 0;

  // Track Web Worker request IDs and timing
  let activeRequestId = 0;
  let requestStartTime = 0;
  let lastSampleTimeMs = null;
  let currentStatusText = 'Initializing Web Worker...';
  let benchmarkMarkdown = '';
  let onWorkerRequestDone = null;

  // Spawn the module Web Worker for non-blocking factorized inverse-CDF sampling
  const worker = new Worker(new URL('./worker/sampler.worker.js', import.meta.url), {
    type: 'module',
  });

  // Mount the interactive UI HUD controls
  const ui = createControlsUI({
    controlsEl,
    statsEl,
    perfEl,
    initialState: appState,
    onStateChange: (newState) => {
      appState = newState;
      window.history.replaceState(null, '', serializeHashState(appState));
      triggerOrbitalSampling(appState, true);
    },
    onRenderSettingChange: (newState) => {
      appState = newState;
      scene.setPointSize(appState.pointSize);
      scene.setColorMode(appState.colorMode);
      scene.setAutoRotate(appState.autoRotate);
      scene.setSlicePlane(appState.slicePlane);
    },
    onRunBenchmark: () => {
      runAutomatedBenchmark();
    },
  });

  // Update the FPS counter in #perf-panel every 500ms
  scene.setFpsCallback((fps) => {
    ui.updatePerfPanel({
      fps,
      sampleTimeMs: lastSampleTimeMs,
      statusText: currentStatusText,
      benchmarkMarkdown,
    });
  });

  /**
   * Sends a sampling request to the background Web Worker and resets the progressive buffers.
   *
   * @param {object} state - Orbital state to sample.
   * @param {boolean} [refitCamera=true] - Whether to re-frame the camera distance for the new orbital.
   */
  function triggerOrbitalSampling(state, refitCamera = true) {
    activeRequestId += 1;
    accumulatedRadiiCount = 0;
    runningRadiusSum = 0;

    // Estimate outer radius rMax immediately so the camera and 2D plot scale cleanly
    const estimatedRMax = computeAdaptiveRMax(state.n, state.l);
    scene.clearCloud(estimatedRMax, state.useReal);
    if (refitCamera) {
      scene.fitCameraToRadius(estimatedRMax * 0.55);
    }

    requestStartTime = performance.now();
    currentStatusText = `Sampling ${state.pointCount.toLocaleString()} points in Web Worker...`;

    ui.updateOrbitalStats({
      n: state.n,
      l: state.l,
      m: state.m,
      useReal: state.useReal,
      sampleMeanR: 0,
      activePoints: 0,
      totalPoints: state.pointCount,
    });

    ui.updatePerfPanel({
      fps: scene.getCurrentFps(),
      sampleTimeMs: lastSampleTimeMs,
      statusText: currentStatusText,
      benchmarkMarkdown,
    });

    worker.postMessage({
      requestId: activeRequestId,
      n: state.n,
      l: state.l,
      m: state.m,
      count: state.pointCount,
      isReal: state.useReal,
      chunkSize: 25000,
      seed: 137035999 + state.n * 100 + state.l * 10 + (state.m + 10),
    });
  }

  // Handle incoming zero-copy Transferable chunks from sampler.worker.js
  worker.onmessage = (event) => {
    const msg = event.data;
    if (!msg || msg.requestId !== activeRequestId) {
      return; // Ignore stale chunks from superseded requests
    }

    if (msg.type === 'error') {
      currentStatusText = `Worker Error: ${msg.message}`;
      ui.updatePerfPanel({
        fps: scene.getCurrentFps(),
        sampleTimeMs: lastSampleTimeMs,
        statusText: currentStatusText,
        benchmarkMarkdown,
      });
      return;
    }

    if (msg.type === 'chunk') {
      // 1. Append 3D points and compute RGB colors on the GPU BufferGeometry
      scene.appendChunk(msg, appState.useReal);

      // 2. Accumulate radial distances for the 2D histogram and empirical <r>_MC
      const chunkRadii = msg.radii;
      const count = msg.chunkCount ?? msg.chunkPoints ?? 0;
      const copyCount = Math.min(count, allRadiiBuffer.length - accumulatedRadiiCount);
      if (copyCount > 0) {
        allRadiiBuffer.set(chunkRadii.subarray(0, copyCount), accumulatedRadiiCount);
        for (let i = 0; i < copyCount; i++) {
          runningRadiusSum += chunkRadii[i];
        }
        accumulatedRadiiCount += copyCount;
      }

      const sampleMeanR =
        accumulatedRadiiCount > 0 ? runningRadiusSum / accumulatedRadiiCount : 0;

      // 3. Update the top-right quantum observables and 2D radial canvas
      ui.updateOrbitalStats({
        n: appState.n,
        l: appState.l,
        m: appState.m,
        useReal: appState.useReal,
        sampleMeanR,
        activePoints: scene.getActivePointCount(),
        totalPoints: appState.pointCount,
      });

      drawRadialPlot(radialCanvas, {
        n: appState.n,
        l: appState.l,
        radii: allRadiiBuffer,
        count: accumulatedRadiiCount,
        rMax: msg.rMax,
      });

      // 4. When the final chunk finishes, record total Worker sampling time
      if (msg.done) {
        lastSampleTimeMs = performance.now() - requestStartTime;
        currentStatusText = `Streamed ${accumulatedRadiiCount.toLocaleString()} pts (Zero-Copy Transferable)`;
        ui.updatePerfPanel({
          fps: scene.getCurrentFps(),
          sampleTimeMs: lastSampleTimeMs,
          statusText: currentStatusText,
          benchmarkMarkdown,
        });
        if (typeof onWorkerRequestDone === 'function') {
          const cb = onWorkerRequestDone;
          onWorkerRequestDone = null;
          cb(lastSampleTimeMs);
        }
      }
    }
  };

  /**
   * Runs an automated in-browser benchmark across 50k, 100k, 250k, and 500k points
   * and outputs a copyable Markdown table in #perf-panel.
   */
  async function runAutomatedBenchmark() {
    const pointCounts = [50000, 100000, 250000, 500000];
    const rows = [
      '| Points | Worker Time (ms) | Mean FPS |',
      '|-------:|-----------------:|---------:|',
    ];

    ui.setBenchmarkRunning(true);
    const savedCount = appState.pointCount;

    for (const count of pointCounts) {
      appState.pointCount = count;
      ui.setStateFromExternal(appState);

      // Wait for Worker sampling to complete
      const workerMs = await new Promise((resolve) => {
        onWorkerRequestDone = resolve;
        triggerOrbitalSampling(appState, false);
      });

      // Measure rendering FPS over 2.5 seconds at this point count
      currentStatusText = `Measuring FPS at ${(count / 1000).toFixed(0)}k points...`;
      const fpsSamples = [];
      await new Promise((resolve) => {
        const interval = setInterval(() => {
          fpsSamples.push(scene.getCurrentFps());
        }, 400);
        setTimeout(() => {
          clearInterval(interval);
          resolve();
        }, 2500);
      });

      const avgFps =
        fpsSamples.length > 0
          ? Math.round(fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length)
          : scene.getCurrentFps();

      rows.push(`| ${count.toLocaleString()} | ${workerMs.toFixed(1)} ms | ${avgFps} FPS |`);
      benchmarkMarkdown = rows.join('\n');
    }

    currentStatusText = 'Benchmark complete! Markdown table ready below:';
    appState.pointCount = savedCount;
    ui.setStateFromExternal(appState);
    ui.setBenchmarkRunning(false);
    ui.updatePerfPanel({
      fps: scene.getCurrentFps(),
      sampleTimeMs: lastSampleTimeMs,
      statusText: currentStatusText,
      benchmarkMarkdown,
    });
  }

  // Listen for browser Back/Forward navigation on URL hash changes
  window.addEventListener('hashchange', () => {
    appState = parseHashState(window.location.hash, appState);
    ui.setStateFromExternal(appState);
    triggerOrbitalSampling(appState, true);
  });

  // Trigger the initial orbital render!
  triggerOrbitalSampling(appState, true);
}

// Auto-initialize only when running inside the browser DOM (not during Node.js unit tests)
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  initBrowserApp();
}