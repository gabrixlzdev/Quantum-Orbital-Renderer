# Monte Carlo Methods, Factorized Inverse-CDF Sampling & PRNG

> **Navigation:** [README](../README.md) | [Quantum Theory & Visual Guide](./quantum-theory.md) | **Monte Carlo & Inverse-CDF Sampling** | [Numerical Methods & IEEE-754](./numerical-methods-js.md) | [System Architecture & WebGL](./system-architecture.md)

This guide explains the statistical physics and algorithmic design behind [`src/physics/sampler.js`](../src/physics/sampler.js) and [`bench/sampling-bench.mjs`](../bench/sampling-bench.mjs), including how **Calculus + Binary Search** achieve an **$866\times$ to $4,739\times$ speedup** over standard 3D rejection sampling.

---

## 1. The Monte Carlo Method from First Principles

Named after the Monte Carlo casino by Stanislaw Ulam, John von Neumann, and Nicholas Metropolis during the Manhattan Project, **Monte Carlo methods** solve deterministic mathematical problems (such as multidimensional integrals or sampling complex probability distributions) by drawing repeated random numbers.

### Why Statistical Error Scales as $\sigma / \sqrt{N}$ (Central Limit Theorem)
Suppose we draw $N$ independent and identically distributed (i.i.d.) radial samples $r_1, r_2, \dots, r_N$ from the true probability density $P(r) = r^2 |R_{n,l}(r)|^2$, which has exact analytical mean $\mu = \langle r \rangle$ and variance $\sigma^2 = \langle r^2 \rangle - \langle r \rangle^2$.

The **sample mean** $\bar{r}_N = \frac{1}{N}\sum_{i=1}^N r_i$ is a random variable whose variance is:

$$\operatorname{Var}(\bar{r}_N) = \operatorname{Var}\!\left(\frac{1}{N}\sum_{i=1}^N r_i\right) = \frac{1}{N^2} \sum_{i=1}^N \operatorname{Var}(r_i) = \frac{N \sigma^2}{N^2} = \frac{\sigma^2}{N}$$

Taking the square root gives the **Standard Error of the Mean ($\text{SE}$)**:

$$\text{SE}(\bar{r}_N) = \frac{\sigma}{\sqrt{N}}$$

- **Physical & Testing Consequence:** To reduce the statistical error by a factor of $10$, we must increase the sample count $N$ by a factor of $100$. In [`test/sampler.spec.js`](../test/sampler.spec.js), we draw $N = 200,000$ samples and verify that the empirical mean $\bar{r}_N$ agrees with the analytical Kramers expectation value $\langle r \rangle$ within $5 \cdot \text{SE}$ ($5\sigma / \sqrt{200,000}$).

---

## 2. Naive 3D Rejection Sampling ("Dartboard Method") vs. Factorized Inverse-CDF

### Why Naive 3D Rejection Sampling Collapses in 3D Space
A standard textbook way to sample a 3D probability density $|\psi(x, y, z)|^2$ is **von Neumann Rejection Sampling**:
1. Enclose the orbital in a 3D Cartesian bounding cube $[-R, +R]^3$ of volume $V_{\text{cube}} = (2R)^3$.
2. Pick a uniform random 3D coordinate $(x, y, z) \in [-R, +R]^3$ and a uniform random height $u \in [0, M]$, where $M = \max |\psi(x, y, z)|^2$.
3. If $u \le |\psi(x, y, z)|^2$, **accept** the point; otherwise **reject** it and try again.

**Why does this waste $> 99.9\%$ of CPU time?**
Because $\iiint |\psi(x, y, z)|^2\,dx\,dy\,dz = 1$, the fraction of accepted darts is the ratio of the integral ($1$) to the 4D hyper-volume of the bounding box $V_{\text{cube}} \cdot M$:

$$P_{\text{accept}} = \frac{1}{(2R)^3 \cdot |\psi|_{\max}^2} < 0.08\%$$

Over **$99.9\%$ of all random 3D draws land in empty space** where $|\psi|^2 \approx 0$ and are thrown away!

### Factorizing the 3D Probability Volume Element
In spherical coordinates $(r, \theta, \phi)$, the 3D volume element is $dV = r^2 \sin\theta \, dr \, d\theta \, d\phi = -r^2 \, dr \, d(\cos\theta) \, d\phi$. Substituting $\psi_{n,l,m}(r, \theta, \phi) = R_{n,l}(r) Y_l^m(\theta, \phi)$ separates the 3D probability into **three independent 1D distributions**:

$$|\psi_{n,l,m}|^2 \, dV = \underbrace{\left[ r^2 |R_{n,l}(r)|^2 \, dr \right]}_{P_R(r)\,dr} \cdot \underbrace{\left[ c_{l,m} |P_l^{|m|}(\cos\theta)|^2 \, d(\cos\theta) \right]}_{P_\Theta(\cos\theta)\,d(\cos\theta)} \cdot \underbrace{\left[ \Phi_m(\phi) \, d\phi \right]}_{P_\Phi(\phi)\,d\phi}$$

Instead of guessing in 3D space, we draw $r$, $\cos\theta$, and $\phi$ independently in 1D!

---

## 3. How Calculus + Binary Search Pick Points Directly Where the Cloud Is Dense

### Why Analytical Inversion Is Impossible for General $(n, l)$
To sample $r$ with $100\%$ acceptance using the **Inverse Transform Method**, we define the **Cumulative Distribution Function (CDF)**:

$$F_R(r) = \int_0^r P_R(r')\,dr' = \int_0^r r'^2 |R_{n,l}(r')|^2\,dr' \in [0, 1]$$

If we draw a uniform random number $u \in [0, 1)$ and solve $F_R(r) = u$ for $r = F_R^{-1}(u)$, the resulting radii $r$ follow the exact distribution $P_R(r)$!
However, $r'^2 |R_{n,l}(r')|^2 = \text{Polynomial}_{2n-2}(r') \cdot e^{-2r'/n}$. Integrating this yields a high-degree polynomial multiplied by $e^{-2r/n}$, and by the Abel–Ruffini theorem, equations of the form $P_{2n-2}(r) e^{-2r/n} = 1 - u$ have **no closed-form algebraic inverse $F_R^{-1}(u)$** for general $(n, l)$.

### How the Tabulated CDF + $O(\log_2 N)$ Binary Search Solves It
In [`buildRadialCDF`](../src/physics/sampler.js#L57-L95) and [`buildPolarCosThetaCDF`](../src/physics/sampler.js#L101-L141):
1. **Tabulate the Integral Once per Orbital:** We numerically integrate $F_R(r_k) = \int_0^{r_k} r'^2 R_{n,l}(r')^2\,dr'$ on a fine grid of $N_{\text{grid}} = 4096$ points over $[0, r_{\max}]$ using the trapezoidal rule.
2. **Why Uniform $u \in [0, 1)$ Automatically Lands in Dense Regions:**
   - By the Fundamental Theorem of Calculus, the slope of the CDF curve is the probability density itself:
     $$\frac{dF_R(r)}{dr} = P_R(r) = r^2 |R_{n,l}(r)|^2 \ge 0$$
   - Where the electron cloud is **very dense** ($P_R(r)$ is large), the CDF $F_R(r)$ climbs **steeply**, spanning a large vertical interval along the $u \in [0, 1)$ axis.
   - Where the electron cloud has a **radial node** ($P_R(r) = 0$), the CDF $F_R(r)$ is completely **flat** (slope $= 0$), occupying **zero** vertical height on the $u \in [0, 1)$ axis!
   - Thus, picking a uniform random number $u \in [0, 1)$ on the vertical axis is mathematically guaranteed to hit dense shells proportionally to their integral and completely skip empty nodes!
3. **Inverting via Binary Search (`invertCDF` in [`src/physics/sampler.js`](../src/physics/sampler.js#L148-L180)):**
   - Because $P_R(r) \ge 0$, the array `cdf[0 .. 4095]` is monotonically non-decreasing (`0.0` up to `1.0`).
   - Given a random draw $u \in [0, 1)$, [`invertCDF`](../src/physics/sampler.js#L148-L180) performs a **binary search** (`lo`, `hi`, `mid = (lo + hi) >>> 1`), cutting the $4096$-element array in half at each step:
     $$\log_2(4096) = 12\text{ comparisons}$$
   - Once the bracketing interval $\text{cdf}[k] \le u \le \text{cdf}[k+1]$ is found in $12$ steps, we linearly interpolate between $r_k$ and $r_{k+1}$:
     $$r = r_k + \frac{u - \text{cdf}[k]}{\text{cdf}[k+1] - \text{cdf}[k]} \Delta r$$

### Measured Speedup (`npm run bench`)
| Orbital | Factorized CDF (100k ms) | Factorized (samples/s) | 3D Rejection Acceptance | 3D Rejection (samples/s) | Speedup |
|:--------|-------------------------:|-----------------------:|------------------------:|-------------------------:|--------:|
| `1s (1,0,0)` | 50.6 ms | 1,976,406 /s | 0.008% | 417 /s | **4739.6x** |
| `2p_z (2,1,0)` | 38.1 ms | 2,626,761 /s | 0.037% | 910 /s | **2886.6x** |
| `3d_z² (3,2,0)` | 43.3 ms | 2,308,456 /s | 0.059% | 2,608 /s | **885.1x** |
| `4f_z³ (4,3,0)` | 42.7 ms | 2,340,199 /s | 0.073% | 2,702 /s | **866.1x** |

---

## 4. Deterministic Pseudorandom Number Generator (`mulberry32`)

JavaScript's built-in `Math.random()` cannot be seeded, which makes unit tests non-reproducible. In [`mulberry32(seed)`](../src/physics/sampler.js#L18-L34), we implement a fast 32-bit deterministic PRNG:

```javascript
export function mulberry32(seed = 1337) {
  let state = seed >>> 0;
  return function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296.0;
  };
}
```

### How It Works Line by Line
1. **Why a `seed` Is an Initial Condition $x_0$:**
   - A PRNG is a deterministic dynamical recurrence relation $x_{k+1} = f(x_k)$ on the finite state space of 32-bit unsigned integers $\{0, 1, \dots, 2^{32}-1\}$. Passing the same initial condition $x_0 = \text{seed}$ produces the **exact same sequence** $x_1, x_2, \dots$ on every machine and OS.
2. **Bitwise Operations Explained:**
   - `>>> 0` (**Unsigned Right-Shift by 0 bits**): Forces JavaScript's 64-bit float `Number` to be interpreted as an unsigned 32-bit integer in $[0, 4294967295]$.
   - `state ^ (state >>> 15)` (**Bitwise XOR-Shift**): Mixes the high bits into the low bits so sequential states (`state + 0x6d2b79f5`) become statistically uncorrelated.
   - `Math.imul(a, b)` (**32-bit Integer Multiplication**): Performs true C-style 32-bit integer multiplication modulo $2^{32}$ without losing lower bits to 64-bit float rounding.
   - `/ 4294967296.0` (**Normalization by $2^{32}$**): Divides the unsigned integer in $[0, 2^{32}-1]$ by $2^{32} = 4,294,967,296$, returning a uniform float in $[0.0, 1.0)$.
