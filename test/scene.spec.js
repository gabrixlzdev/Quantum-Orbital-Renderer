/**
 * @fileoverview Unit tests for pure 3D scene camera framing math in src/render/scene.js.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
// Import the pure camera framing function from our Three.js scene module
import { computeCameraDistanceForRadius } from '../src/render/scene.js';

describe('Three.js Scene Camera Framing (src/render/scene.js)', () => {
  it('computes positive camera distance proportional to orbital outer radius rMax', () => {
    // Compute camera distance for a small orbital (rMax = 10 a0) and a twice-as-large orbital (rMax = 20 a0)
    const d10 = computeCameraDistanceForRadius(10, 50, 1.15);
    const d20 = computeCameraDistanceForRadius(20, 50, 1.15);

    // Both distances must be strictly positive finite numbers
    assert.ok(Number.isFinite(d10) && d10 > 10);
    // Doubling rMax at fixed FOV and margin must exactly double the camera distance
    assert.ok(Math.abs(d20 / d10 - 2.0) < 1e-12);
  });

  it('matches exact trigonometric formula d = (rMax * margin) / tan(fov / 2)', () => {
    // At fovDeg = 90 degrees, halfFov = 45 degrees, so tan(45 deg) = 1.0 exactly!
    const dist = computeCameraDistanceForRadius(15, 90, 1.2);
    // Expected: (15 * 1.2) / 1.0 = 18.0
    assert.ok(Math.abs(dist - 18.0) < 1e-12);
  });

  it('falls back safely to rMax = 5 when given zero or negative radius', () => {
    // Passing 0 or -10 should match computeCameraDistanceForRadius(5)
    const dDefault = computeCameraDistanceForRadius(5);
    const dZero = computeCameraDistanceForRadius(0);
    const dNegative = computeCameraDistanceForRadius(-10);

    assert.strictEqual(dZero, dDefault);
    assert.strictEqual(dNegative, dDefault);
  });
});