import { SeededPRNG } from './prng';

/**
 * Represents the flat physics and rendering state of a single entity.
 * Used to export/import coordinates to ensure identical starting states
 * across all active benchmark simulators.
 */
export interface EntityState {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  angle: number;
  color: string;
}

/**
 * Core interface that all benchmark simulators must implement.
 * Allows the orchestrator loop in `main.ts` to execute, render, and benchmark
 * various architectures (OOP S&P, OOP Tree, Custom ECS, bitECS) uniformly.
 */
export interface Simulator {
  

  
  /**
   * Allocates internal structures and spawns entities.
   * Shuffles arrays if needed to simulate heap fragmentation (AoS cache misses).
   * 
   * @param numEntities Total active entity count.
   * @param width Screen width constraint.
   * @param height Screen height constraint.
   * @param prng Seeded random number generator.
   */
  init(numEntities: number, width: number, height: number, prng: SeededPRNG): void;
  
  /**
   * Executes a single simulation tick. This method is fully timed inside the benchmark loop.
   * It must execute:
   * 1. Position integration (applying velocity).
   * 2. Spatial broadphase (identifying potential overlaps).
   * 3. Narrowphase physics solver (calculating circle bounces and applying velocity impulses).
   * 
   * Timing all three tasks measures the global performance of memory layouts (AoS vs SoA)
   * on sequential array sweeps, indirection lookup pointer hops, and entity property writes.
   * 
   * @returns An object containing the frame calculation time (ms) and the actual narrowphase collision count.
   */
  update(
    width: number,
    height: number,
    speedMultiplier: number,
    behavior: string,
    prng: SeededPRNG
  ): { time: number, collisionCount: number };
  
  /**
   * Draws the entities, collision indicator shapes, and neon contact lines.
   * This is executed outside the timed benchmark section.
   */
  render(ctx: CanvasRenderingContext2D): void;
  
  /**
   * Returns the list of recorded step execution times (ms) since the benchmark start.
   */
  getTimes(): number[];
  
  /**
   * Clears the recorded step execution times.
   */
  clearTimes(): void;
  
  /**
   * Reads current entity parameters. Used by the synchronizer to get positions baseline.
   */
  getPositions(): EntityState[];
  
  /**
   * Forcefully writes entity parameters. Used to sync starting coordinates with the baseline.
   */
  setPositions(positions: EntityState[]): void;
}

