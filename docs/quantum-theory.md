# Quantum Theory & Visual Orbital Guide

> **Navigation:** [README](../README.md) | **Quantum Theory & Visual Guide** | [Monte Carlo & Inverse-CDF Sampling](./monte-carlo-sampling.md) | [Numerical Methods & IEEE-754](./numerical-methods-js.md) | [System Architecture & WebGL](./system-architecture.md)

This document derives the exact analytical solutions of the non-relativistic, spinless Hydrogen Atom ($Z = 1$) implemented in [`src/physics/radial.js`](../src/physics/radial.js) and [`src/physics/angular.js`](../src/physics/angular.js), and explains the physical meaning of every visual element in the 3D point cloud, color modes, and 2D radial probability plot.

---

## 1. The 3D Time-Independent Schrödinger Equation

An electron of reduced mass $\mu \approx m_e$ moving in the central Coulomb potential $V(r) = -\frac{Z e^2}{4\pi \varepsilon_0 r}$ of a stationary proton ($Z = 1$) obeys the 3D Time-Independent Schrödinger Equation:

$$\hat{H}\psi(\mathbf{r}) = E\psi(\mathbf{r}) \implies \left( -\frac{\hbar^2}{2m_e} \nabla^2 - \frac{e^2}{4\pi \varepsilon_0 r} \right) \psi(r, \theta, \phi) = E \psi(r, \theta, \phi)$$

### Atomic Units ($a_0 = 1$)
To avoid floating-point underflow from powers of $\hbar \approx 1.054 \times 10^{-34}\text{ J}\cdot\text{s}$, all spatial coordinates in [`src/physics/`](../src/physics/) are expressed in **atomic units (Bohr radii $a_0$)**:

$$a_0 = \frac{4\pi \varepsilon_0 \hbar^2}{m_e e^2} \approx 0.529177 \times 10^{-10}\text{ m} = 1\text{ a.u.}$$

In atomic units ($\hbar = m_e = e = 4\pi\varepsilon_0 = 1$), the Hamiltonian simplifies to:

$$\left( -\frac{1}{2} \nabla^2 - \frac{1}{r} \right) \psi(r, \theta, \phi) = E \psi(r, \theta, \phi)$$

### Separation of Variables in Spherical Coordinates $(r, \theta, \phi)$
Using the physics convention where $r \in [0, \infty)$ is the radial distance, $\theta \in [0, \pi]$ is the polar colatitude angle measured from the $+z$ axis, and $\phi \in [0, 2\pi)$ is the azimuthal angle in the $xy$-plane:

$$\begin{aligned}
x &= r \sin\theta \cos\phi \\
y &= r \sin\theta \sin\phi \\
z &= r \cos\theta
\end{aligned}$$

Because the Coulomb potential $V(r) = -1/r$ depends only on radius $r$, the Laplacian $\nabla^2$ separates into a radial differential operator and the squared orbital angular momentum operator $\hat{L}^2$:

$$\psi_{n,l,m}(r, \theta, \phi) = R_{n,l}(r) \cdot Y_l^m(\theta, \phi)$$

---

## 2. Why Quantum Numbers Obey $n \ge 1$, $0 \le l < n$, and $|m| \le l$

Substituting $\psi(r,\theta,\phi) = \frac{u(r)}{r} Y_l^m(\theta,\phi)$ into the Schrödinger equation yields the 1D radial equation with an **effective potential** $V_{\text{eff}}(r)$:

$$-\frac{1}{2}\frac{d^2 u}{dr^2} + \underbrace{\left[ -\frac{1}{r} + \frac{l(l+1)}{2r^2} \right]}_{V_{\text{eff}}(r)} u(r) = E u(r)$$

1. **Why $n = 1$ ONLY permits $l = 0$ and $m = 0$ (The $1s$ Ground State):**
   - The repulsive term $+\frac{l(l+1)}{2r^2}$ is the **centrifugal barrier** arising from orbital angular momentum $|\mathbf{L}| = \sqrt{l(l+1)}\hbar$.
   - For the bound-state wavefunction ($E < 0$) to be normalizable ($\int_0^\infty |R_{n,l}(r)|^2 r^2 dr = 1$) instead of diverging to $\infty$ as $r \to \infty$, the power-series solution must terminate as a polynomial of degree $n_r \ge 0$:
     $$n_r = n - l - 1 \ge 0 \implies 0 \le l \le n - 1$$
   - Therefore, when you select **$n = 1$** in the UI, the only physically allowed azimuthal quantum number is **$l = 0$**, and since $|m| \le l$, the only allowed magnetic quantum number is **$m = 0$**.
2. **Why $|m| \le l$:**
   - The magnetic quantum number $m$ determines the $z$-component of orbital angular momentum ($L_z = m\hbar$). Since the projection of a vector along the $z$-axis cannot exceed its total length ($|L_z| \le |\mathbf{L}|$), $m$ is restricted to the $2l + 1$ integer values $m \in \{-l, -l+1, \dots, +l\}$.

---

## 3. Radial Wavefunction $R_{n,l}(r)$ & Observables ([`src/physics/radial.js`](../src/physics/radial.js))

In dimensionless scaled radius $\rho = \frac{2r}{n}$, the normalized radial wavefunction is:

$$R_{n,l}(r) = \sqrt{\left(\frac{2}{n}\right)^3 \frac{(n - l - 1)!}{2n \, (n + l)!}} \; e^{-\rho / 2} \, \rho^l \, L_{n - l - 1}^{2l + 1}(\rho)$$

### Generalized Laguerre Polynomials $L_p^k(\rho)$
Rather than expanding alternating-sign power series (which suffer from catastrophic floating-point cancellation at large $\rho$), [`generalizedLaguerre(p, k, x)`](../src/physics/radial.js#L18-L41) evaluates $L_p^k(x)$ via the stable three-term upward recurrence relation:

$$\begin{aligned}
L_0^k(x) &= 1 \\
L_1^k(x) &= 1 + k - x \\
(m + 1) L_{m+1}^k(x) &= (2m + 1 + k - x) L_m^k(x) - (m + k) L_{m-1}^k(x)
\end{aligned}$$

### Exact Quantum Observables Displayed in the Top-Right HUD (`#info-panel`)
- **Eigenenergy ($E_n$):**
  $$E_n = -\frac{13.6057\text{ eV}}{n^2}$$
- **Radial Nodes ($n_r$):** The Laguerre polynomial $L_{n-l-1}^{2l+1}(\rho)$ has exactly $n - l - 1$ distinct positive roots, producing **$n - l - 1$ concentric spherical shells** where $R_{n,l}(r) = 0$.
- **Angular Nodes ($l$):** The spherical harmonic $Y_l^m(\theta, \phi)$ has **$l$ nodal surfaces** (planes or cones passing through the nucleus). Total nodes $= (n - l - 1) + l = n - 1$.
- **Kramers Analytical Expectation Values ($\langle r \rangle$ and $\langle r^2 \rangle$):**
  $$\langle r \rangle = \int_0^\infty r \, P_{n,l}(r)\,dr = \frac{1}{2}\left[ 3n^2 - l(l + 1) \right] a_0$$
  $$\langle r^2 \rangle = \int_0^\infty r^2 \, P_{n,l}(r)\,dr = \frac{n^2}{2}\left[ 5n^2 + 1 - 3l(l + 1) \right] a_0^2$$

---

## 4. Angular Wavefunction $Y_l^m(\theta, \phi)$ & Condon-Shortley Phase ([`src/physics/angular.js`](../src/physics/angular.js))

### Associated Legendre Polynomials $P_l^m(x)$ ($x = \cos\theta$)
[`associatedLegendre(l, m, x)`](../src/physics/angular.js#L15-L60) computes $P_l^m(x)$ for $m \ge 0$ and $x \in [-1, 1]$ using three recurrence steps that completely avoid $\frac{1}{\sin\theta}$ singularities at the poles ($\theta = 0, \pi$):
1. **Diagonal Seed ($l = m$) with Condon-Shortley Phase $(-1)^m$:**
   $$P_m^m(x) = (-1)^m (2m - 1)!! \, (1 - x^2)^{m/2}$$
2. **First Step ($l = m + 1$):**
   $$P_{m+1}^m(x) = x \, (2m + 1) \, P_m^m(x)$$
3. **Upward Degree Recurrence ($l \ge m + 2$):**
   $$(l - m) P_l^m(x) = (2l - 1) x P_{l-1}^m(x) - (l + m - 1) P_{l-2}^m(x)$$

---

## 5. Visual Guide: What the 3D Dot Colors, Complex Mode & 2D Graph Mean

### A. What Do the Cyan and Coral-Orange Dot Colors Mean in `Real` Mode?
In a 3D point cloud, the **spatial concentration of dots** represents the Born probability density $|\psi(r, \theta, \phi)|^2$ — where the electron is most likely to be detected.
However, squaring the wavefunction ($|\psi|^2$) erases the **algebraic sign ($+$ or $-$)** of $\psi$!
In **Real Harmonic Basis** (`Real (px, py, pz, d...)`), the wavefunction is a real number at every point $(x, y, z)$:

$$\psi_{n,l,m}^{\text{real}}(r, \theta, \phi) = R_{n,l}(r) \times \begin{cases}
\sqrt{2} N_l^{|m|} P_l^{|m|}(\cos\theta) \cos(m\phi) & \text{if } m > 0 \\
N_l^0 P_l^0(\cos\theta) & \text{if } m = 0 \\
\sqrt{2} N_l^{|m|} P_l^{|m|}(\cos\theta) \sin(|m|\phi) & \text{if } m < 0
\end{cases}$$

- **Electric Cyan-Blue Dots ($\psi > 0$):** Lobes where the wavefunction amplitude is **positive ($+$)**.
- **Coral-Orange Dots ($\psi < 0$):** Lobes where the wavefunction amplitude is **negative ($-$)**.
- **Dark Gaps Between Cyan and Orange:** **Nodal surfaces** where $\psi = 0$ exactly (the wavefunction must pass through zero whenever it changes sign from $+$ to $-$!).
- **Physical Significance in Chemistry:** When two atoms approach each other, overlapping lobes of the **same color/sign** ($\psi_A > 0$ and $\psi_B > 0$) interfere **constructively** ($\psi_A + \psi_B$) to form a covalent **bonding orbital**, whereas lobes of **opposite color/sign** (cyan + orange) interfere **destructively** ($\psi_A - \psi_B = 0$) to form an **antibonding node**.

### B. Why Do the Shape and Colors Change When Switching to `Complex` Mode?
When you switch **Harmonic Basis** to **`Complex (e^imφ)`** for any state with $m \ne 0$:
$$\psi_{n,l,m}^{\text{complex}}(r, \theta, \phi) = R_{n,l}(r) \, N_l^{|m|} P_l^{|m|}(\cos\theta) \, e^{i m \phi} = |\psi_{n,l,m}(r, \theta)| \, e^{i \varphi}$$

1. **Why the 3D shape becomes a symmetric Donut / Torus around the Z-axis:**
   - By Euler's formula, $|e^{im\phi}|^2 = \cos^2(m\phi) + \sin^2(m\phi) = 1$ for every azimuthal angle $\phi \in [0, 2\pi)$.
   - Therefore, a pure angular-momentum eigenstate ($L_z \psi = m\hbar \psi$) has **azimuthal rotational symmetry** around the Z-axis! Instead of pointing along the X-axis ($2p_x$) or Y-axis ($2p_y$), the probability density $|\psi|^2$ forms a continuous 3D ring (torus) encircling the Z-axis.
2. **Why the colors become a $2\pi$ Rainbow Wheel:**
   - In complex mode, $\psi$ has a continuous phase angle $\varphi \in [-\pi, +\pi]$ rather than just a $\pm 1$ sign.
   - [`buildOrbitalColors`](../src/render/colors.js#L95-L103) maps $\varphi \in [-\pi, +\pi]$ onto a smooth $120^\circ$-offset cosine RGB color wheel so that $-\pi$ and $+\pi$ join seamlessly without a hard seam.
   - As your eyes follow the rainbow around the ring in the $xy$-plane, the color cycles $|m|$ times per $360^\circ$ revolution, visualizing the **quantum probability current** of the electron orbiting the Z-axis:
     $$\mathbf{j} = \frac{\hbar}{m_e}\text{Im}(\psi^* \nabla\psi)$$

### C. What Does the 2D Graph (`P(r) = r²|Rₙₗ(r)|² vs. MC Samples`) Show?
The 2D canvas on the top-right ([`src/ui/radial-plot.js`](../src/ui/radial-plot.js)) plots the **radial probability distribution** $P(r)$ as a function of distance $r$ from the nucleus:

$$P_{n,l}(r) = r^2 |R_{n,l}(r)|^2, \qquad \int_0^\infty P_{n,l}(r)\,dr = 1$$

- **Why is there an $r^2$ factor in $P(r) = r^2 |R_{n,l}(r)|^2$?**
  - Even though the 3D density $|\psi_{1,0,0}(r)|^2$ of the $1s$ orbital is highest right at the proton ($r = 0$), the volume of a thin spherical shell between $r$ and $r + dr$ is $dV_{\text{shell}} = 4\pi r^2 dr$. At $r = 0$, the shell surface area $4\pi r^2$ vanishes! Multiplying by $r^2$ gives the probability of finding the electron anywhere at radius $r$, which peaks at **exactly $r = 1.0\,a_0$ (the Bohr radius)** for $1s$.
- **What the 3 overlaid elements on the graph prove:**
  1. **Bright Cyan Curve:** The exact analytical formula $P(r) = r^2 |R_{n,l}(r)|^2$ from solving the Schrödinger Equation.
  2. **Translucent Blue Bars:** The empirical histogram of the actual 3D points streamed from our Monte Carlo Web Worker, normalized as a true probability density so that the Riemann sum equals $1$:
     $$\hat{P}_b = \frac{N_b}{N_{\text{total}} \cdot \Delta r}, \qquad \sum_b \hat{P}_b \Delta r = 1$$
  3. **Dashed Gold Vertical Line:** The analytical expectation value $\langle r \rangle$ (compared live against `MC ⟨r⟩` in the text above the plot).
  - Watching the blue histogram bars converge onto the cyan analytical curve and touch zero at every radial node is a **live visual verification** of our Monte Carlo sampler!
