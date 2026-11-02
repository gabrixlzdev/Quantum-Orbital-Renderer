// Preallocated 64-bit float lookup table for factorials 0! through 20! (O(1) lookup, zero GC allocation)
const FACTORIAL_TABLE = new Float64Array(21);

//base case: 0! = 1 
FACTORIAL_TABLE[0] = 1.0;

// Populate factorials iteratively at module load time so hot loops never recompute them
for(let i = 1; i<=20; i++){
    // Recurrence n! = n * (n - 1)! stored in contiguous IEEE-754 double-precision memory
    FACTORIAL_TABLE[i] = FACTORIAL_TABLE[i-1] * i;
}

/**
 * Returns k! in O(1) time from the precomputed Float64Array lookup table.
 */

export function factorial(k){

    
    if(!Number.isInteger(k) || k < 0){
        // Throw a descriptive error so invalid physics calls fail fast during testing
        throw new RangeError('Factorial requires a non-negative integer, received: ${k}');
    }

    // Return directly from contiguous typed array if within precomputed bounds (up to 20!)
    if(k < FACTORIAL_TABLE.length){
        // O(1) typed array index access avoids loop overhead inside normalization formulas
        return FACTORIAL_TABLE[k];
    }

    // Fallback iterative accumulation for k > 20 without call-stack recursion overhead
    let accumalator = FACTORIAL_TABLE[FACTORIAL_TABLE.length - 1];
    // Multiply remaining terms from 21 up to k in registers
    for(let i = FACTORIAL_TABLE.length; i <= k; i++){
        // Accumulate product in IEEE-754 double precision (exact up to 21!, finite up to 170!)
        accumalator *= i; // *= -> multiply what i already got by i 

    }

    //return computed factorial value
    return accumalator;
}

/**
 * Validates quantum numbers (n, l, m) against Pauli/Schrodinger boundary conditions:
 * n >= 1, 0 <= l < n, and -l <= m <= l.
 */
export function validateQuantumNumbers(n,l=0,m=0){
    // Quantum number arise from boundary value quantization and must be exact intergers
    if(!Number.isInteger(n) || !Number.isInteger(l) || !Number.isInteger(m)){

        throw new RangeError('Quantum numbers (n,l,m) must be integers, received: ($(n), $(l), $(m))')
        
    }

    // Principal quantum number n determines the energy shell and must be at least 1
    if (n<1){
        throw new RangeError('Principal quantum number n must be >= 1, received: $(n)');
    }

     // Azimuthal quantum number l is bounded by 0 <= l <= n - 1 from radial series termination
    if(l < 0 || l>= n ){
        throw new RangeError('Azimuthal quantum number l must satisfy 0 <= l < n (n = $(n)), received: $(l) ')
    }

    //magnetic quantum number m is bounded by -1 <= m <= 1 from single valuedness of Y_l^m (theta, phi))
    if (Math.abs(m)>l){
        throw new RangeError('Magnetic quantum number m must satisfy abs(m) <= 1, received: $(m)');
    }
}

/**
 * Returns an array of valid azimuthal quantum numbers l = [0, 1, ..., n - 1] for a given n.
 */

export function getValidRanges(n){

    validateQuantumNumbers(n,0,0); //validate that n is a positive integer before constructing range

    const list = new Array(n); //preallocate exact array length n to avoid dynamic resizing in v8

    //populate allowed angular momentum values from 0 (s-orbital) to n-1 (highest allowed l for given n) in O(n) time
    for(let l = 0; l < n; l++){
        list[l] = l; //store integer l at index
    }

    return list; //return valid l choices for UI dropdown and test interators
}

/**
 * Returns an array of valid magnetic quantum numbers m = [-l, ..., 0, ..., +l] for a given l.
 */

export function getValidMRanges(l){

    // Validate that l is a non-negative integer (using n= 1+l as minimal valid shell))
    validateQuantumNumbers(l+1, l, 0);

    //total magnetic sublevels for a given l is  2*l + 1 (spatial degenaracy)
    const count = 2 * l + 1;
    
    //preallocate exact array lenght (2l +1) to avoid dynamic resizing in v8
    const list = new Array(count);

    //populate m from -l to +l in acending order
    for (let i = 0; i< count; i++){
        list[i] = i-l;
    }

    return list; // -> m valid choices for UI dropdown and test iterators
}

