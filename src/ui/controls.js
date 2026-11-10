/**
 * @fileoverview Interactive HUD Controls, Quantum Observables Display, and Telemetry Panel.
 * Enforces quantum selection rules (0 <= l < n, -l <= m <= l) reactively in the DOM.
 */

// Import quantum number range generators from our physics module
import { getValidRanges, getValidMRanges } from '../physics/quantum-numbers.js';
// Import analytical hydrogen observables for the top-right info panel
import {
  MAX_N,
  orbitalLabel,
  orbitalEnergyEv,
  radialNodeCount,
  angularNodeCount,
  expectedRadius,
} from '../physics/radial.js';
// Import supported color mode constants
import { COLOR_MODES } from '../render/colors.js';

/**
 * Returns a human-readable Cartesian symmetry subtitle for real orbitals (e.g., "2pz", "3d_xz").
 *
 * @param {number} n - Principal quantum number.
 * @param {number} l - Azimuthal quantum number.
 * @param {number} m - Magnetic quantum number.
 * @param {boolean} useReal - Whether real linear combinations are active.
 * @returns {string} Formatted orbital designation.
 */
export function formatDetailedOrbitalTitle(n, l, m, useReal) {
  const base = orbitalLabel(n, l);
  if (!useReal) {
    const mStr = m > 0 ? `+${m}` : `${m}`;
    return `${base} (m = ${mStr}, complex)`;
  }
  if (l === 0) return `${base} (spherical)`;
  if (l === 1) {
    const pMap = { '-1': 'y', '0': 'z', '1': 'x' };
    return `${base}_${pMap[String(m)] || m}`;
  }
  if (l === 2) {
    const dMap = { '-2': 'xy', '-1': 'yz', '0': 'z²', '1': 'xz', '2': 'x²-y²' };
    return `${base}_${dMap[String(m)] || m}`;
  }
  const mSign = m > 0 ? `+${m}` : `${m}`;
  return `${base} (m = ${mSign}, real)`;
}

/**
 * Mounts the interactive controls into #controls-panel and provides methods to update
 * the #orbital-stats and #perf-panel HUD overlays.
 *
 * @param {object} config - Configuration and callbacks.
 * @param {HTMLElement} config.controlsEl - The #controls-panel container.
 * @param {HTMLElement} config.statsEl - The #orbital-stats container.
 * @param {HTMLElement} config.perfEl - The #perf-panel container.
 * @param {object} config.initialState - Initial { n, l, m, useReal, pointCount, pointSize, colorMode, autoRotate, slicePlane }.
 * @param {function(object): void} config.onStateChange - Fired when quantum numbers or sample count change.
 * @param {function(object): void} config.onRenderSettingChange - Fired when visual-only settings change.
 * @param {function(): void} config.onRunBenchmark - Fired when the user clicks the Benchmark button.
 * @returns {object} UI controller API.
 */
export function createControlsUI({
  controlsEl,
  statsEl,
  perfEl,
  initialState,
  onStateChange,
  onRenderSettingChange,
  onRunBenchmark,
}) {
  // Clone initial state so UI mutations are tracked cleanly
  const state = { ...initialState };

  // Build the HTML structure inside #controls-panel
  controlsEl.innerHTML = `
    <div style="font-weight: 700; font-size: 0.95rem; margin-bottom: 10px; color: #38bdf8;">
      ⚛️ Quantum State (n, l, m)
    </div>
    <div class="control-row">
      <label for="select-n">Principal (n):</label>
      <select id="select-n"></select>
    </div>
    <div class="control-row">
      <label for="select-l">Azimuthal (l):</label>
      <select id="select-l"></select>
    </div>
    <div class="control-row">
      <label for="select-m">Magnetic (m):</label>
      <select id="select-m"></select>
    </div>
    <div class="control-row">
      <label for="select-basis">Harmonic Basis:</label>
      <select id="select-basis">
        <option value="real">Real (px, py, pz, d...)</option>
        <option value="complex">Complex (e^imφ)</option>
      </select>
    </div>

    <hr style="border: none; border-top: 1px solid rgba(148,163,184,0.2); margin: 10px 0;" />
    <div style="font-weight: 700; font-size: 0.9rem; margin-bottom: 8px; color: #94a3b8;">
      🎨 Point Cloud & View
    </div>
    <div class="control-row">
      <label for="slider-points">Points: <span id="label-points"></span></label>
      <input id="slider-points" type="range" min="10000" max="500000" step="10000" style="width: 120px;" />
    </div>
    <div class="control-row">
      <label for="slider-size">Point Size: <span id="label-size"></span></label>
      <input id="slider-size" type="range" min="0.05" max="0.50" step="0.01" style="width: 120px;" />
    </div>
    <div class="control-row">
      <label for="select-color">Color Mode:</label>
      <select id="select-color">
        <option value="${COLOR_MODES[0]}">Sign / Phase</option>
        <option value="${COLOR_MODES[1]}">Radial Distance (r)</option>
        <option value="${COLOR_MODES[2]}">Monochrome Cyan</option>
      </select>
    </div>
    <div class="control-row">
      <label for="check-rotate">Auto-Rotate Camera:</label>
      <input id="check-rotate" type="checkbox" />
    </div>
    <div class="control-row">
      <label for="check-slice">Cross-Section (z ≤ 0):</label>
      <input id="check-slice" type="checkbox" />
    </div>
    <button id="btn-benchmark" type="button">⏱️ Run Automated FPS Benchmark</button>
  `;

  // Query DOM references inside #controls-panel
  const selectN = controlsEl.querySelector('#select-n');
  const selectL = controlsEl.querySelector('#select-l');
  const selectM = controlsEl.querySelector('#select-m');
  const selectBasis = controlsEl.querySelector('#select-basis');
  const sliderPoints = controlsEl.querySelector('#slider-points');
  const labelPoints = controlsEl.querySelector('#label-points');
  const sliderSize = controlsEl.querySelector('#slider-size');
  const labelSize = controlsEl.querySelector('#label-size');
  const selectColor = controlsEl.querySelector('#select-color');
  const checkRotate = controlsEl.querySelector('#check-rotate');
  const checkSlice = controlsEl.querySelector('#check-slice');
  const btnBenchmark = controlsEl.querySelector('#btn-benchmark');

  // Populate Principal Quantum Number n = 1 .. MAX_N (6)
  for (let nVal = 1; nVal <= MAX_N; nVal++) {
    const opt = document.createElement('option');
    opt.value = String(nVal);
    opt.textContent = `n = ${nVal}`;
    selectN.appendChild(opt);
  }

  /**
   * Rebuilds the <select id="select-l"> options for the current state.n
   * and clamps state.l into [0, n - 1].
   */
  function syncLOptions() {
    const validLs = getValidRanges(state.n);
    if (!validLs.includes(state.l)) {
      state.l = validLs[validLs.length - 1];
    }
    selectL.innerHTML = '';
    const subshellLetters = ['s', 'p', 'd', 'f', 'g', 'h'];
    for (const lVal of validLs) {
      const opt = document.createElement('option');
      opt.value = String(lVal);
      opt.textContent = `l = ${lVal} (${subshellLetters[lVal] || lVal})`;
      selectL.appendChild(opt);
    }
    selectL.value = String(state.l);
  }

  /**
   * Rebuilds the <select id="select-m"> options for the current state.l
   * and clamps state.m into [-l, +l].
   */
  function syncMOptions() {
    const validMs = getValidMRanges(state.l);
    if (!validMs.includes(state.m)) {
      state.m = 0;
    }
    selectM.innerHTML = '';
    for (const mVal of validMs) {
      const opt = document.createElement('option');
      opt.value = String(mVal);
      const signStr = mVal > 0 ? `+${mVal}` : `${mVal}`;
      opt.textContent = `m = ${signStr}`;
      selectM.appendChild(opt);
    }
    selectM.value = String(state.m);
  }

  // Initialize form controls from initialState
  selectN.value = String(state.n);
  syncLOptions();
  syncMOptions();
  selectBasis.value = state.useReal ? 'real' : 'complex';
  sliderPoints.value = String(state.pointCount);
  labelPoints.textContent = `${(state.pointCount / 1000).toFixed(0)}k`;
  sliderSize.value = String(state.pointSize);
  labelSize.textContent = state.pointSize.toFixed(2);
  selectColor.value = state.colorMode;
  checkRotate.checked = Boolean(state.autoRotate);
  checkSlice.checked = Boolean(state.slicePlane);

  // Wire up event listeners for quantum state changes (requires Web Worker re-sampling)
  selectN.addEventListener('change', () => {
    state.n = Number(selectN.value);
    syncLOptions();
    syncMOptions();
    onStateChange({ ...state });
  });

  selectL.addEventListener('change', () => {
    state.l = Number(selectL.value);
    syncMOptions();
    onStateChange({ ...state });
  });

  selectM.addEventListener('change', () => {
    state.m = Number(selectM.value);
    onStateChange({ ...state });
  });

  selectBasis.addEventListener('change', () => {
    state.useReal = selectBasis.value === 'real';
    onStateChange({ ...state });
  });

  sliderPoints.addEventListener('input', () => {
    labelPoints.textContent = `${(Number(sliderPoints.value) / 1000).toFixed(0)}k`;
  });

  sliderPoints.addEventListener('change', () => {
    state.pointCount = Number(sliderPoints.value);
    onStateChange({ ...state });
  });

  // Wire up visual-only controls (instant GPU updates, zero Web Worker re-sampling!)
  sliderSize.addEventListener('input', () => {
    state.pointSize = Number(sliderSize.value);
    labelSize.textContent = state.pointSize.toFixed(2);
    onRenderSettingChange({ ...state });
  });

  selectColor.addEventListener('change', () => {
    state.colorMode = selectColor.value;
    onRenderSettingChange({ ...state });
  });

  checkRotate.addEventListener('change', () => {
    state.autoRotate = checkRotate.checked;
    onRenderSettingChange({ ...state });
  });

  checkSlice.addEventListener('change', () => {
    state.slicePlane = checkSlice.checked;
    onRenderSettingChange({ ...state });
  });

  btnBenchmark.addEventListener('click', () => {
    if (typeof onRunBenchmark === 'function') {
      onRunBenchmark();
    }
  });

  /**
   * Updates the top-right #orbital-stats HUD with analytical and empirical quantum observables.
   *
   * @param {object} metrics - Current orbital metrics ({ n, l, m, useReal, sampleMeanR, activePoints, totalPoints }).
   */
  function updateOrbitalStats({ n, l, m, useReal, sampleMeanR, activePoints, totalPoints }) {
    const title = formatDetailedOrbitalTitle(n, l, m, useReal);
    const energy = orbitalEnergyEv(n);
    const rNodes = radialNodeCount(n, l);
    const aNodes = angularNodeCount(l);
    const exactMeanR = expectedRadius(n, l);
    const mcMeanStr =
      typeof sampleMeanR === 'number' && sampleMeanR > 0
        ? `${sampleMeanR.toFixed(2)} a₀`
        : '...';

    statsEl.innerHTML = `
      <div style="font-weight: 700; font-size: 1.05rem; color: #38bdf8; margin-bottom: 6px;">
        Orbital: ${title}
      </div>
      <div style="line-height: 1.55; color: #cbd5e1;">
        <div><strong>Energy (Eₙ):</strong> ${energy.toFixed(4)} eV</div>
        <div><strong>Radial Nodes (n−l−1):</strong> ${rNodes} &nbsp;|&nbsp; <strong>Angular (l):</strong> ${aNodes}</div>
        <div><strong>Exact ⟨r⟩:</strong> ${exactMeanR.toFixed(2)} a₀ &nbsp;|&nbsp; <strong>MC ⟨r⟩:</strong> ${mcMeanStr}</div>
        <div><strong>Streamed Points:</strong> ${activePoints.toLocaleString()} / ${totalPoints.toLocaleString()}</div>
      </div>
    `;
  }

  /**
   * Updates the bottom-left #perf-panel HUD with FPS, Worker sampling duration, and optional benchmark report.
   *
   * @param {object} perf - Performance telemetry ({ fps, sampleTimeMs, statusText, benchmarkMarkdown }).
   */
  function updatePerfPanel({ fps, sampleTimeMs, statusText, benchmarkMarkdown }) {
    const timeStr = typeof sampleTimeMs === 'number' ? `${sampleTimeMs.toFixed(1)} ms` : '...';
    let html = `
      <div><strong>FPS:</strong> <span style="color:#4ade80">${fps}</span> &nbsp;|&nbsp; <strong>Worker Sampling:</strong> <span style="color:#38bdf8">${timeStr}</span></div>
      <div style="color:#94a3b8; margin-top: 2px;">${statusText || 'Ready (Zero-Copy Transferable Stream)'}</div>
    `;
    if (benchmarkMarkdown) {
      html += `
        <pre style="margin-top:8px; padding:6px; background:#05070d; border:1px solid #334155; border-radius:4px; font-size:0.7rem; overflow-x:auto; color:#e2e8f0;">${benchmarkMarkdown}</pre>
      `;
    }
    perfEl.innerHTML = html;
  }

  return {
    getState: () => ({ ...state }),
    setStateFromExternal: (newPartial) => {
      Object.assign(state, newPartial);
      selectN.value = String(state.n);
      syncLOptions();
      syncMOptions();
      selectBasis.value = state.useReal ? 'real' : 'complex';
      sliderPoints.value = String(state.pointCount);
      labelPoints.textContent = `${(state.pointCount / 1000).toFixed(0)}k`;
      sliderSize.value = String(state.pointSize);
      labelSize.textContent = state.pointSize.toFixed(2);
      selectColor.value = state.colorMode;
      checkRotate.checked = Boolean(state.autoRotate);
      checkSlice.checked = Boolean(state.slicePlane);
    },
    setBenchmarkRunning: (running) => {
      btnBenchmark.disabled = running;
      btnBenchmark.textContent = running
        ? '⏳ Benchmarking (50k..500k)...'
        : '⏱️ Run Automated FPS Benchmark';
    },
    updateOrbitalStats,
    updatePerfPanel,
  };
}