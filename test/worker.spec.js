import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CHUNK_SIZE,
  processSamplingRequest,
} from '../src/worker/sampler.worker.js';

describe('Web Worker Progressive Orbital Sampler (sampler.worker.js)', () => {
  // Test 1: Progressive streaming splits 50,000 points into chunks of 20,000, 20,000, and 10,000
  it('streams progressive chunks of DEFAULT_CHUNK_SIZE (20,000) with Transferable buffers', () => {
    const messages = [];
    const transfers = [];

    processSamplingRequest(
      {
        requestId: 77,
        n: 3,
        l: 2,
        m: 1,
        count: 50000,
        isReal: true,
        seed: 123,
        chunkSize: DEFAULT_CHUNK_SIZE,
      },
      (msg, transferList) => {
        messages.push(msg);
        transfers.push(transferList);
      }
    );

    // 50,000 / 20,000 = 3 chunks (20,000 + 20,000 + 10,000)
    assert.equal(messages.length, 3);
    assert.equal(messages[0].chunkCount, 20000);
    assert.equal(messages[0].done, false);
    assert.equal(messages[1].chunkCount, 20000);
    assert.equal(messages[1].done, false);
    assert.equal(messages[2].chunkCount, 10000);
    assert.equal(messages[2].done, true);
    assert.equal(messages[2].generated, 50000);
    assert.equal(messages[2].requestId, 77);

    // Verify every chunk provides 3 Transferable ArrayBuffers (positions, radii, phases)
    for (let i = 0; i < messages.length; i++) {
      assert.equal(transfers[i].length, 3);
      assert.equal(transfers[i][0], messages[i].positions.buffer);
      assert.equal(transfers[i][1], messages[i].radii.buffer);
      assert.equal(transfers[i][2], messages[i].phases.buffer);
    }
  });

  // Test 2: Emits structured error message when given invalid quantum numbers
  it('emits an error message with matching requestId when given invalid quantum numbers', () => {
    const messages = [];
    processSamplingRequest(
      { requestId: 99, n: 1, l: 1, m: 0, count: 1000 },
      (msg) => messages.push(msg)
    );

    assert.equal(messages.length, 1);
    assert.equal(messages[0].type, 'error');
    assert.equal(messages[0].requestId, 99);
    assert.ok(messages[0].message.length > 0);
  });
});