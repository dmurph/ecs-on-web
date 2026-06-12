// A simple and fast Linear Congruential Generator (LCG) for deterministic random numbers.
// This is used to ensure parity between different ECS/OOP implementations.
export class SeededPRNG {
  seed: number;

  constructor(seed: number = 1) {
    this.seed = seed;
  }

  // Returns a pseudo-random float between 0 (inclusive) and 1 (exclusive)
  next(): number {
    // LCG parameters from Numerical Recipes
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }

  // Returns a pseudo-random float between min and max
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  // Re-seed the generator
  setSeed(seed: number) {
    this.seed = seed;
  }
}
