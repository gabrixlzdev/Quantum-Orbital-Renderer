// Import native Node.js test runner primitives (zero external npm dependencies)
import { describe, it } from 'node:test';

// Import strict assertion library for floating-point and exception verification
import assert from 'node:assert/strict';

import {
    factorial,
    validateQuantumNumbers,
    getValidRanges,
    getValidMRanges,
} from '../src/physics/quantum-numbers.js';

describe('Quantum Numbers & factorials (quantum-numbers.js)', () => {
    it('computes exact factorials from looup table and fallback loop', () => {
        // base case 0! = 1
        assert.equal(factorial(0), 1);

        // small factorial 5! = 120
        assert.equal(factorial(5), 120);

        // max needed for n=6, l=5, is (6+5)! = 11! = 39916800
        assert.equal(factorial(11), 39916800);

        // Check 21! (tests the for-loop fallback since FACTORIAL_TABLE only stores indices 0..20)
        const fact21 = factorial(21);
        const expected21 = 21 * factorial(20);
        assert.equal(fact21, expected21);

        // verify fallback loop beyond lookup table index 20
        assert.ok(Math.abs(factorial(21) - 51090942171709440000) / 51090942171709440000 < 1e-12);
    });

    it('generates valid l and m quantum number ranges', () => {
        // For n = 3, allowed l values are [0, 1, 2] (3s, 3p, 3d)
        assert.deepEqual(getValidRanges(3), [0, 1, 2]);
        // For l = 2 (d-orbital), allowed m values are [-2, -1, 0, 1, 2]
        assert.deepEqual(getValidMRanges(2), [-2, -1, 0, 1, 2]);
    });

    it('rejects invalid quantum numbers (n, l, m) with RangeError', () => {
        // n < 1 is unphysical
        assert.throws(() => validateQuantumNumbers(0,1, 0), RangeError);
        assert.throws(() => validateQuantumNumbers(0, 0, 0), RangeError);
        // l >= n violates radial series termination
        assert.throws(() => validateQuantumNumbers(2, 2, 0), RangeError);
        // l < 0 is unphysical
        assert.throws(() => validateQuantumNumbers(2, -1, 0), RangeError);
        // |m| > l violates angular boundary condition
        assert.throws(() => validateQuantumNumbers(3, 2, 3), RangeError);
        assert.throws(() => validateQuantumNumbers(3, 2, -3), RangeError);
        // Non-integers must be rejected
        assert.throws(() => validateQuantumNumbers(1.5, 0, 0), RangeError);
    });
});