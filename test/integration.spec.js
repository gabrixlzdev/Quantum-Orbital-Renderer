/**
 * @fileoverview End-to-End Integration Test for Quantum-Orbital-Renderer.
 * Exercises the complete pipeline: URL Hash State -> Quantum Validation ->
 * Progressive Web Worker Streaming -> RGB Vertex Color Mapping -> Camera Framing ->
 * 2D Radial Histogram & Analytical Expectation Verification.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseHashState, serializeHashState } from '../src/main.js';
import { validateQuantumNumbers } from '../src/physics/quantum-numbers.js';
import { expectedRadius, orbitalEnergyEv, radialNodeCount, angularNodeCount } from '../src/physics/radial.js';
import { processSamplingRequest } from '../src/worker/sampler.worker.js';
import { buildOrbitalColors, COLOR_MODES } from '../src/render/colors.js';
import { computeCameraDistanceForRadius } from '../src/render/scene.js';
import { computeRadialHistogramAndCurve } from '../src/ui/radial-plot.js';
import { formatDetailedOrbitalTitle } from '../src/ui/controls.js';

describe('End-to-End Orbital Pipeline Integration (test/integration.spec.js)', () => {
  it('streams 60,000 points from URL hash through Worker, Color Mapper, Camera Framer, and 2D Plotter', () => {
    // 1. Parse URL hash state for the 3d_z^2 orbital (n = 3, l = 2, m = 0, real mode, 60k points)
    const state = parseHashState('#n=3&l=2&m=0&real=1&points=60000');
    assert.strictEqual(state.n, 3);
    assert.strictEqual(state.l, 2);
    assert.strictEqual(state.m, 0);
    assert.strictEqual(state.useReal, true);
    assert.strictEqual(state.pointCount, 60000);
    assert.strictEqual(serializeHashState(state), '#n=3&l=2&m=0&real=1&points=60000');

    // 2. Validate quantum numbers and verify analytical HUD observables
    validateQuantumNumbers(state.n, state.l, state.m);
    assert.strictEqual(formatDetailedOrbitalTitle(state.n, state.l, state.m, state.useReal), '3d_z²');
    assert.strictEqual(radialNodeCount(state.n, state.l), 0);
    assert.strictEqual(angularNodeCount(state.l), 2);
    assert.ok(orbitalEnergyEv(state.n) < -1.5);

    // 3. Stream progressive chunks from the Web Worker processor
    const chunks = [];
    const totalPositions = new Float32Array(state.pointCount * 3);
    const totalColors = new Float32Array(state.pointCount * 3);
    const totalRadii = new Float32Array(state.pointCount);
    let accumulated = 0;
    let streamRMax = 0;

    processSamplingRequest(
      {
        requestId: 77,
        n: state.n,
        l: state.l,
        m: state.m,
        count: state.pointCount,
        isReal: state.useReal,
        chunkSize: 20000,
        seed: 2026,
      },
      (msg, transferList) => {
        assert.strictEqual(msg.type, 'chunk');
        assert.strictEqual(msg.requestId, 77);
        assert.strictEqual(transferList.length, 3);
        chunks.push(msg);

        const c = msg.chunkCount;
        totalPositions.set(msg.positions, accumulated * 3);
        totalRadii.set(msg.radii, accumulated);

        // 4. Color each chunk in-place across all 3 supported color modes
        const colorSub = totalColors.subarray(accumulated * 3, (accumulated + c) * 3);
        for (const mode of COLOR_MODES) {
          buildOrbitalColors({
            radii: msg.radii,
            phases: msg.phases,
            r995: msg.r995,
            isReal: state.useReal,
            colorMode: mode,
            outColors: colorSub,
          });
        }

        accumulated += c;
        streamRMax = msg.rMax;
      }
    );

    // Verify 3 progressive chunks of 20,000 points were emitted
    assert.strictEqual(chunks.length, 3);
    assert.strictEqual(accumulated, 60000);
    assert.strictEqual(chunks[2].done, true);

    // 5. Verify camera auto-framing distance is finite and positive
    const camDist = computeCameraDistanceForRadius(streamRMax, 50);
    assert.ok(Number.isFinite(camDist) && camDist > streamRMax);

    // 6. Verify 2D radial histogram normalization and Monte Carlo <r> convergence
    const { binDensity, meanR } = computeRadialHistogramAndCurve({
      n: state.n,
      l: state.l,
      radii: totalRadii,
      count: accumulated,
      rMax: streamRMax,
      numBins: 48,
    });

    const binWidth = streamRMax / 48;
    let histIntegral = 0;
    for (let b = 0; b < 48; b++) {
      histIntegral += binDensity[b] * binWidth;
    }
    assert.ok(Math.abs(histIntegral - 1.0) < 1e-3);

    // Empirical mean <r>_MC must match analytical <r> = 10.5 a0 within 0.15 a0
    let sumR = 0;
    for (let i = 0; i < accumulated; i++) {
      sumR += totalRadii[i];
    }
    const mcMeanR = sumR / accumulated;
    const exactMeanR = expectedRadius(state.n, state.l);
    assert.strictEqual(exactMeanR, 10.5);
    assert.strictEqual(meanR, 10.5);
    assert.ok(Math.abs(mcMeanR - exactMeanR) < 0.15);
  });
});
