import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { COLOR_MODES, buildOrbitalColors } from '../src/render/colors.js';

describe('Orbital Color Mapping (colors.js)', () => {
  // Test 1: Real mode 'phase' assigns distinct opposite colors for +1 and -1 sign lobes
  it('assigns distinct opposite RGB colors for positive (+1) and negative (-1) real lobes', () => {
    const radii = new Float32Array([1.0, 2.0]);
    const phases = new Float32Array([1.0, -1.0]);

    const colors = buildOrbitalColors({
      radii,
      phases,
      r995: 5.0,
      isReal: true,
      colorMode: 'phase',
    });

    assert.ok(colors instanceof Float32Array);
    assert.equal(colors.length, 6);
    // Point 0 (+1 lobe) and Point 1 (-1 lobe) must have different RGB colors
    assert.notEqual(colors[0], colors[3]);
    assert.notEqual(colors[1], colors[4]);
    assert.notEqual(colors[2], colors[5]);
  });

  // Test 2: Complex mode 'phase' wraps seamlessly at -pi and +pi
  it('maps complex phase -pi and +pi to the exact same cyclic RGB color', () => {
    const radii = new Float32Array([1.0, 1.0]);
    const phases = new Float32Array([-Math.PI, Math.PI]);

    const colors = buildOrbitalColors({
      radii,
      phases,
      r995: 5.0,
      isReal: false,
      colorMode: 'phase',
    });

    assert.ok(Math.abs(colors[0] - colors[3]) < 1e-6);
    assert.ok(Math.abs(colors[1] - colors[4]) < 1e-6);
    assert.ok(Math.abs(colors[2] - colors[5]) < 1e-6);
  });

  // Test 3: 'radius' and 'single' modes and in-place 'outColors' buffer reuse
  it('supports radius and single color modes and reuses preallocated outColors buffer', () => {
    const radii = new Float32Array([0.0, 5.0, 10.0]);
    const phases = new Float32Array([1.0, 1.0, -1.0]);
    const preallocated = new Float32Array(9);

    const radiusColors = buildOrbitalColors({
      radii,
      phases,
      r995: 10.0,
      colorMode: 'radius',
      outColors: preallocated,
    });

    // Must reuse the exact same Float32Array reference in memory (zero allocation)
    assert.equal(radiusColors, preallocated);

    // Core (r = 0) and outer shell (r = 10) must have distinct gradient colors
    assert.notEqual(radiusColors[0], radiusColors[6]);

    // Single mode assigns identical RGB to all points
    const singleColors = buildOrbitalColors({
      radii,
      phases,
      colorMode: 'single',
    });
    assert.equal(singleColors[0], singleColors[3]);
    assert.equal(singleColors[1], singleColors[4]);
    assert.equal(singleColors[2], singleColors[5]);
    assert.deepEqual(COLOR_MODES, ['phase', 'radius', 'single']);
  });

  // Test 4: TypeError and RangeError validation guards
  it('rejects non-Float32Array inputs or mismatched array lengths', () => {
    assert.throws(
      () => buildOrbitalColors({ radii: [1, 2], phases: new Float32Array(2) }),
      TypeError
    );
    assert.throws( () => buildOrbitalColors({ radii: new Float32Array(2), phases: new Float32Array(3),}), RangeError);});
});