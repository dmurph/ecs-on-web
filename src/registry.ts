import type { Simulator } from './simulator';
import { OOPSimulator } from './benchmarks/benchmark_oop';
import { OOPTreeSimulator } from './benchmarks/benchmark_oop_tree';
import { CustomECSSimulator } from './benchmarks/benchmark_custom_ecs';
import { ECSTreeSimulator } from './benchmarks/benchmark_ecs_tree';
import { WasmECSSimulator } from './benchmarks/benchmark_wasm_ecs';
import { WasmTreeSimulator } from './benchmarks/benchmark_wasm_tree';
import { BitECSSimulator } from './benchmarks/benchmark_bitecs';
import { SortMethod } from './config';

export interface SimulatorConfig {
  id: string;
  name: string;
  color: string;
  activeByDefault: boolean;
  createInstance: () => Simulator;
}

export const SIMULATOR_REGISTRY: SimulatorConfig[] = [
  {
    id: 'oop',
    name: 'OOP S&P (Insertion)',
    color: '#6d28d9',
    activeByDefault: true,
    createInstance: () => new OOPSimulator(SortMethod.Insertion),
  },
  {
    id: 'oop-quick',
    name: 'OOP S&P (Quick)',
    color: '#4f46e5',
    activeByDefault: false,
    createInstance: () => new OOPSimulator(SortMethod.Quick),
  },
  {
    id: 'oop-merge',
    name: 'OOP S&P (Merge)',
    color: '#9333ea',
    activeByDefault: false,
    createInstance: () => new OOPSimulator(SortMethod.Merge),
  },
  {
    id: 'oop-native',
    name: 'OOP S&P (Native)',
    color: '#1d4ed8',
    activeByDefault: false,
    createInstance: () => new OOPSimulator(SortMethod.Native),
  },
  {
    id: 'oop-tree',
    name: 'OOP Tree',
    color: '#c2410c',
    activeByDefault: true,
    createInstance: () => new OOPTreeSimulator(),
  },
  {
    id: 'ecs',
    name: 'ECS S&P (Insertion)',
    color: '#0f766e',
    activeByDefault: true,
    createInstance: () => new CustomECSSimulator(SortMethod.Insertion),
  },
  {
    id: 'ecs-quick',
    name: 'ECS S&P (Quick)',
    color: '#059669',
    activeByDefault: false,
    createInstance: () => new CustomECSSimulator(SortMethod.Quick),
  },
  {
    id: 'ecs-merge',
    name: 'ECS S&P (Merge)',
    color: '#0891b2',
    activeByDefault: false,
    createInstance: () => new CustomECSSimulator(SortMethod.Merge),
  },
  {
    id: 'ecs-native',
    name: 'ECS S&P (Native)',
    color: '#15803d',
    activeByDefault: false,
    createInstance: () => new CustomECSSimulator(SortMethod.Native),
  },
  {
    id: 'ecs-tree',
    name: 'ECS Tree',
    color: '#b45309',
    activeByDefault: true,
    createInstance: () => new ECSTreeSimulator(),
  },
  {
    id: 'bitecs',
    name: 'BitECS S&P (Insertion)',
    color: '#0284c7',
    activeByDefault: true,
    createInstance: () => new BitECSSimulator(SortMethod.Insertion),
  },
  {
    id: 'bitecs-quick',
    name: 'BitECS S&P (Quick)',
    color: '#0369a1',
    activeByDefault: false,
    createInstance: () => new BitECSSimulator(SortMethod.Quick),
  },
  {
    id: 'bitecs-merge',
    name: 'BitECS S&P (Merge)',
    color: '#075985',
    activeByDefault: false,
    createInstance: () => new BitECSSimulator(SortMethod.Merge),
  },
  {
    id: 'bitecs-native',
    name: 'BitECS S&P (Native)',
    color: '#0c4a6e',
    activeByDefault: false,
    createInstance: () => new BitECSSimulator(SortMethod.Native),
  },
  {
    id: 'wasm',
    name: 'WASM ECS S&P (Insertion)',
    color: '#be185d',
    activeByDefault: true,
    createInstance: () => new WasmECSSimulator(SortMethod.Insertion),
  },
  {
    id: 'wasm-quick',
    name: 'WASM ECS S&P (Quick)',
    color: '#e11d48',
    activeByDefault: false,
    createInstance: () => new WasmECSSimulator(SortMethod.Quick),
  },
  {
    id: 'wasm-merge',
    name: 'WASM ECS S&P (Merge)',
    color: '#9d174d',
    activeByDefault: false,
    createInstance: () => new WasmECSSimulator(SortMethod.Merge),
  },
  {
    id: 'wasm-tree',
    name: 'WASM Tree',
    color: '#a21caf',
    activeByDefault: true,
    createInstance: () => new WasmTreeSimulator(),
  },
];
