# Numerical Methods in JavaScript: IEEE-754, Quadrature & C++/Python Comparisons

> **Navigation:** [README](../README.md) | [Quantum Theory & Visual Guide](./quantum-theory.md) | [Monte Carlo & Inverse-CDF Sampling](./monte-carlo-sampling.md) | **Numerical Methods & IEEE-754** | [System Architecture & WebGL](./system-architecture.md)

This guide explains the numerical computing foundations used across [`src/physics/`](../src/physics/) and [`test/`](../test/), including IEEE-754 floating-point precision limits, numerical integration via higher-order functions, and how JavaScript `TypedArray` memory layouts compare to **C++** and **Python**.

---

## 1. IEEE-754 64-Bit Floating-Point Limits (`src/physics/quantum-numbers.js`)

In JavaScript, every standard `Number` (and every element of a `Float64Array`) is stored as an **IEEE-754 double-precision (64-bit) floating-point number** (`double` in C++, `float` in Python):

$$\text{Value} = (-1)^{\text{sign}} \times \left(1 + \frac{\text{mantissa}}{2^{52}}\right) \times 2^{\text{exponent} - 1023}$$

- **1 bit:** Sign ($+$ or $-$)
- **11 bits:** Biased exponent ($-1022$ to $+1023$, giving a maximum finite value of $\approx 1.79769 \times 10^{308}$)
- **52 explicit bits ($+1$ implicit leading bit $= 53$ bits):** Significand / Mantissa

### Why Factorials Are Exact Up to $21!$ and Overflow Above $170!$
In [`src/physics/quantum-numbers.js`](../src/physics/quantum-numbers.js), we precompute factorials $n!$ in a `Float64Array(22)` lookup table for radial and angular normalization constants $\sqrt{\frac{(n-l-1)!}{2n(n+l)!}}$:

1. **Exact Integer Limit (`Number.MAX_SAFE_INTEGER` and $21!$):**
   - Because the mantissa has $53$ bits of binary precision, any integer up to $2^{53} - 1 = 9,007,199,254,740,991$ (`Number.MAX_SAFE_INTEGER`) is represented with **zero rounding error**.
   - Even slightly above $2^{53}$, factorials like $18!, 19!, 20!, 21!$ contain enough trailing factors of $2$ (which shift the binary exponent rather than consuming mantissa bits) that our 22-entry table `FACTORIAL_TABLE[0..21]` covers every factorial needed up to quantum number $n = 10$ ($2n + 1 = 21$) in $O(1)$ time!
2. **Overflow Limit ($170! \to \text{Infinity}$):**
   - The largest finite IEEE-754 64-bit number is `Number.MAX_VALUE` $\approx 1.79769 \times 10^{308}$.
   - Since $170! \approx 7.257 \times 10^{306} < 1.797 \times 10^{308}$ whereas $171! \approx 1.241 \times 10^{309} > 1.797 \times 10^{308}$, calling `factorial(171)` overflows to `Infinity` in JavaScript, C++ `double`, and Python `float(math.factorial(171))`.

---

## 2. Higher-Order Numerical Quadrature (`fn(r)` and `(r) => ...`)

In [`test/radial.spec.js`](../test/radial.spec.js) and [`test/angular.spec.js`](../test/angular.spec.js), we verify that our wavefunctions satisfy fundamental quantum normalization and expectation integrals:

$$\int_0^\infty P_{n,l}(r)\,dr = 1, \qquad \langle r \rangle = \int_0^\infty r \, P_{n,l}(r)\,dr, \qquad \langle r^2 \rangle = \int_0^\infty r^2 \, P_{n,l}(r)\,dr$$

### How Mathematical Functionals Map to JavaScript Arrow Callbacks
In mathematics, a definite integral operator $I[f] = \int_a^b f(r)\,dr$ is a **functional** — a rule that takes a *function* $f$ as its input and returns a *number*.
Instead of writing three separate `for`-loop functions for $\int P(r)\,dr$, $\int r P(r)\,dr$, and $\int r^2 P(r)\,dr$, we write a single **Higher-Order Quadrature Function** `integrateRadial(fn, rMax, steps)` that accepts any mathematical function `fn` as a parameter:

```javascript
function integrateRadial(fn, rMax = 120, steps = 20000) {
  const dr = rMax / steps;
  let sum = 0.0;
  for (let i = 0; i < steps; i++) {
    const rMid = (i + 0.5) * dr; // Midpoint of sub-interval [i*dr, (i+1)*dr]
    sum += fn(rMid);             // Evaluate the passed-in function f(r) at rMid
  }
  return sum * dr;
}
```

When we call `integrateRadial`, we pass an anonymous **arrow function** `(r) => ...` (representing the mathematical mapping $r \mapsto f(r)$):

| Mathematical Integral | JavaScript Arrow Function Call |
| :--- | :--- |
| $\int_0^{r_{\max}} P_{n,l}(r)\,dr$ | `integrateRadial((r) => radialProbabilityDensity(n, l, r))` |
| $\int_0^{r_{\max}} r \, P_{n,l}(r)\,dr$ | `integrateRadial((r) => r * radialProbabilityDensity(n, l, r))` |
| $\int_0^{r_{\max}} r^2 \, P_{n,l}(r)\,dr$ | `integrateRadial((r) => r * r * radialProbabilityDensity(n, l, r))` |

---

## 3. Systems Comparison: JavaScript `TypedArray` vs. C++ vs. Python

A common misconception is that JavaScript arrays are always slow, boxed linked lists. Modern JavaScript engines (V8 in Chrome/Node.js) provide **TypedArrays** (`Float32Array`, `Float64Array`) backed by raw, contiguous C-style byte buffers (`ArrayBuffer`).

| Systems Concept | JavaScript (ES2022 + WebGL) | C++20 (OpenGL) | Python (`NumPy`) |
| :--- | :--- | :--- | :--- |
| **Contiguous 32-bit Float Buffer** | `new Float32Array(N * 3)` | `std::vector<float>(N * 3)` | `np.zeros(N * 3, dtype=np.float32)` |
| **Contiguous 64-bit Float Buffer** | `new Float64Array(N)` | `std::vector<double>(N)` | `np.zeros(N, dtype=np.float64)` |
| **Zero-Copy Sub-Buffer View** | `buf.subarray(start, end)` | `std::span<float>(ptr + start, len)` | `buf[start:end]` (NumPy view) |
| **Copying Sub-Buffer into Target** | `target.set(srcSubarray, offset)` | `std::memcpy(dst + offset, src, bytes)` | `target[offset:offset+len] = src` |
| **Zero-Copy Thread Hand-Off** | `postMessage(msg, [buf.buffer])` (`Transferable`) | `std::move(vec)` across threads | `multiprocessing.shared_memory` |

### Critical Distinction: `.subarray()` vs. `.slice()`
In [`src/render/scene.js`](../src/render/scene.js#L180-L195), when appending a 25,000-point chunk from the Web Worker into the 500,000-point GPU buffer, we use:
```javascript
const colorSubarray = colorBuffer.subarray(offset3, offset3 + countToCopy * 3);
```
- **`Float32Array.prototype.slice(start, end)`** allocates a **new heap buffer** and copies the elements (causing Garbage Collection pauses).
- **`Float32Array.prototype.subarray(start, end)`** allocates **zero heap memory**: just like `std::span<float>` in C++20, it creates a lightweight `(pointer, byteOffset, length)` header pointing directly into the existing `colorBuffer` `ArrayBuffer`!
