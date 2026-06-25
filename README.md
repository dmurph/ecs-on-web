# ECS vs OOP Spatial Benchmark

An interactive, real-time performance benchmark comparing **Object-Oriented Programming (OOP)** and **Data-Oriented Entity Component System (ECS)** architectures, implemented in both Javascript and WebAssembly (via AssemblyScript). The benchmark uses a Sweep-and-Prune collision detection algorithm as well as spatial trees to measure performance characteristics.

- 🌐 **Live Interactive Demo:** [dmurph.github.io/ecs-on-web/](https://dmurph.github.io/ecs-on-web/)
- 📖 **Write-up / Blog Post:** [ECS vs. OOP Benchmark on dmurph.com](https://www.dmurph.com/posts/2026/06/ecs_vs_oop_benchmark/ecs_vs_oop_benchmark.html)

## Overview

This project was built to explore whether Javascript can realize the hardware cache locality gains of Data-Oriented Entity Component Systems (ECS), or if heap allocations and V8 pointer indirections erode these benefits. It compares:

1. **Object-Oriented Programming (OOP)** models.
2. **Custom ECS** (implemented from scratch in Javascript).
3. **bitECS** (a highly optimized Javascript ECS library).
4. **WebAssembly ECS** (written in AssemblyScript).
5. **Spatial Trees** (O(N log N) spatial sorting) vs **Sweep & Prune (S&P)** (flat linear-sort O(N²) collision checks) across different movement patterns (Wandering, Erratic, Static).

## Getting Started

### Development

To start the local development server (this compiles the AssemblyScript modules to WebAssembly first and launches Vite):

```bash
npm install
npm run dev
```

### Production Build

To build the static files for production deployment:

```bash
npm run build
```

This compiles the AssemblyScript files and runs the Vite build, outputting the results into the `dist/` folder.

### Running Command-Line Benchmarks

To run the benchmarks headlessly in Node.js and output a Markdown table of results:

```bash
npm run benchmark
```

## License

This project is open-source. Feel free to explore, modify, and benchmark!
