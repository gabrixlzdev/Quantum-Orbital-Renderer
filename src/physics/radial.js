import { getValidMRanges,getValidRanges,validateQuantumNumbers,factorial } from './quantum-numbers.js';


// maximum principal number n exposed in the UI controls (n in [1,6])
export const MAX_N = 6;

//// Ground-state ionization energy of Hydrogen (1 Rydberg = 13.605693 eV, Griffiths Ch. 4)
export const RYBERG_EV = 13.6057; // Rydberg constant in eV

// Spectroscopic subshell letters corresponding to azimuthal quantum number l = 0, 1, 2, 3, 4, 5
const SUBSHELLS = ['s', 'p', 'd', 'f', 'g', 'h'];



/**
 * Evaluates the Generalized Laguerre Polynomial L_k^alpha(x) using the numerically stable
 * three-term upward recurrence relation:
 * (j + 1) L_{j+1}^alpha(x) = (2j + 1 + alpha - x) L_j^alpha(x) - (j + alpha) L_{j-1}^alpha(x)
 */

export function generalizedLaguerre(k, alpha, x){
    
    // Degree k = n - l - 1 must be a non-negative integer
    if (!Number.isInteger(k) || k < 0){
        throw new RangeError('Laguerre degree k must be a non-negative integer, received: $(k)');
    }


    if(k === 0) return 1.0; // base case k = 0: L_0^alpha(x) = 1 for all alpha and x

    if(k === 1) return 1.0 + alpha - x; // k = 1 -> L_1^alpha(x) = 1 + alpha - x

    // initialize two-step register variables L_{j-1} and l_j to avoid allocating an array
    let lPrev = 1.0;
    
    //L_l^alpha(x) serves as the starting current term for j = 1
    let lCurr = 1.0 + alpha - x;
    
    // Iterate upward from j = 1 to k - 1 using only CPU registers (O(k) time, O(1) space)
    for (let j = 1; j < k; j++){
        // Apply three-term recurrence relation to compute L_{j+1}^alpha(x)
        const lNext = ((2 * j + 1 + alpha - x) * lCurr - (j+alpha) *lPrev) / (j + 1);

        lPrev = lCurr; //shift to next interation

        lCurr = lNext; //shift newly computed value into current register
    }

    return lCurr; //return L_k^alpha(x) after k iterations
}

/**
 * Computes the radial normalization constant N_{n,l} in atomic units (a_0 = 1):
 * N_{n,l} = sqrt( (2 / n)^3 * (n - l - 1)! / (2n * (n + l)!) )
 */

export function radialNormalization(n,l){

    // Ensure (n, l) satisfy quantum mechanical bounds before computing factorials
    validateQuantumNumbers(n, l, 0);

    // Radial scaling factor (2 / n)^3 arising from coordinate substitution rho = 2r / n
    const scaleCubed = (2.0 / n)**3

    // Numerator factorial (n - l - 1)! where k = n - l - 1 is the radial node count
    const numFact = factorial(n - l - 1);

    // Denominator 2n * (n + l)! from the orthogonality integral of generalized Laguerre polynomials
    const denFact = 2.0 * n * factorial(n + l);

    // Return square root so that integral_0^infinity r^2 [R_{n,l}(r)]^2 dr = 1
    return Math.sqrt( (scaleCubed * numFact) / denFact); 
}

/**
 * Evaluates the normalized hydrogen radial wavefunction R_{n,l}(r) in atomic units (a_0 = 1):
 * R_{n,l}(r) = N_{n,l} * exp(-rho / 2) * rho^l * L_{n-l-1}^{2l+1}(rho), where rho = 2r / n.
 */

export function radialWavefunction(n,l,r){

    validateQuantumNumbers(n,l,0);

    if (typeof r !== "number" || Number.isNaN(r) || r < 0){
        throw new RangeError("Radial r must be a non-negative number, received: $(r)")
    }

    // Dimensionless scaled radius rho = 2r / (n * a_0) with a_0 = 1
    const rho = (2.0 * r) / n;
    
    // Normalization constant N_{n,l} ensuring unit total probability
    const normalization = radialNormalization(n, l);

    // Centrifugal barrier term rho^l (explicitly 1.0 when l = 0 so 0^0 = 1 at the nucleus r = 0)
    const centrifugal = l === 0 ? 1.0 : rho ** l;

    //exponential asymptotic decay exp(-rho / 2) = exp(-r / n) for large distances
    const decay = Math.exp(-rho / 2);

    // Generalized Laguerre polynomial L_{n-l-1}^{2l+1}(rho) producing (n - l - 1) radial nodes
    const laguerre = generalizedLaguerre(n-l-1, 2*l +1, rho);

    //combine all factor to return R_{n,l}{r}
    return normalization * decay * centrifugal * laguerre;
}

/**
 * Evaluates the radial probability density P(r) = r^2 * |R_{n,l}(r)|^2 in atomic units.
 * Including the spherical shell Jacobian factor r^2 guarantees integral_0^inf P(r) dr = 1.
 */

export function radialProbabilityDensity(n, l, r){

    //evaluate the radial wavefunction amplitude r_{n,1}{r}
    const R = radialWavefunction(n, l, r);

    return (r*r)*(R*R); //return P(r) = r^2 * |R_{n,l}(r)|^2
}

/**
 * Returns the exact number of radial nodes (spherical shells where R_{n,l}(r) = 0 for 0 < r < inf).
 */

export function radialNodeCount(n, l){

    validateQuantumNumbers(n, l, 0);

    // Degree of L_{n-l-1}^{2l+1} equals the number of distinct positive roots: n - l - 1
    return n - l - 1;
}

/**
 * Returns the number of angular nodal surfaces (cones/planes where Y_l^m(theta, phi) = 0).
 */

export function angularNodeCount(l){

    validateQuantumNumbers(l+1, l , 0); // Validate non-negative integer l

    // Total angular nodes is always equal to the azimuthal quantum number l
    return l;
}

/**
 * Computes the Bohr/Schrodinger eigenstate energy E_n = -13.6057 / n^2 in electron-volts (eV).
 */
export function orbitalEnergyEv(n){

    validateQuantumNumbers(n, 0, 0);

    // Energy depends solely on n for the non-relativistic Coulomb potential
    return -RYBERG_EV / (n * n);
}

/**
 * Computes the analytical expectation value <r> in Bohr radii (a_0 = 1), Griffiths Eq. 4.85:
 * <r> = (3n^2 - l(l + 1)) / 2
 */
export function expectedRadius(n, l){

    validateQuantumNumbers(n, l, 0);

    //Exact closed-form Kramers relation for mean electron-nucleus distance
    return 0.5 * (3 * (n * n) - (l * (l + 1)) );
}

/**
 * Computes the analytical expectation value <r^2> in squared Bohr radii (a_0^2 = 1), Griffiths Eq. 4.86:
 * <r^2> = n^2 * (5n^2 + 1 - 3l(l + 1)) / 2
 */

export function expectedRadiusSquared(n,l){

    validateQuantumNumbers(n,l,0);

    //exact closed-form Kramers relation for mean squared radius <r^2> = integral_0^inf r^2 * P(r) dr
    return 0.5 * ((n * n) * ((5 * (n * n) ) + 1 - (3 * l * (l + 1))));
}

/**
 * Returns the spectroscopic orbital label (e.g., "1s", "2p", "3d", "4f").
 */

export function orbitalLabel(n, l){

    validateQuantumNumbers(n, l, 0);

    // Lookup subshell letter or fall back to numeric notation if l >= SUBSHELL_LETTERS.length
    const letter = SUBSHELLS[l] ?? `[l=${l}]`;
    // Format as standard spectroscopic string (e.g. "3d")
    return `${n}${letter}`;
}