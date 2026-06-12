import type { Simulator } from './simulator';
import { OOPSimulator } from './benchmark_oop';
import { OOPTreeSimulator } from './benchmark_oop_tree';
import { CustomECSSimulator } from './benchmark_custom_ecs';
import { ECSTreeSimulator } from './benchmark_ecs_tree';
import { WasmECSSimulator } from './benchmark_wasm_ecs';

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
    createInstance: () => new OOPSimulator('insertion', 'oop', 'OOP S&P (Insertion)')
  },
  {
    id: 'oop-quick',
    name: 'OOP S&P (Quick)',
    color: '#4f46e5',
    activeByDefault: false,
    createInstance: () => new OOPSimulator('quick', 'oop-quick', 'OOP S&P (Quick)')
  },
  {
    id: 'oop-merge',
    name: 'OOP S&P (Merge)',
    color: '#9333ea',
    activeByDefault: false,
    createInstance: () => new OOPSimulator('merge', 'oop-merge', 'OOP S&P (Merge)')
  },
  {
    id: 'oop-native',
    name: 'OOP S&P (Native)',
    color: '#1d4ed8',
    activeByDefault: false,
    createInstance: () => new OOPSimulator('native', 'oop-native', 'OOP S&P (Native)')
  },
  {
    id: 'oop-tree',
    name: 'OOP Tree',
    color: '#c2410c',
    activeByDefault: true,
    createInstance: () => new OOPTreeSimulator('oop-tree', 'OOP Tree')
  },
  {
    id: 'ecs',
    name: 'ECS S&P (Insertion)',
    color: '#0f766e',
    activeByDefault: true,
    createInstance: () => new CustomECSSimulator('insertion', 'ecs', 'ECS S&P (Insertion)')
  },
  {
    id: 'ecs-quick',
    name: 'ECS S&P (Quick)',
    color: '#059669',
    activeByDefault: false,
    createInstance: () => new CustomECSSimulator('quick', 'ecs-quick', 'ECS S&P (Quick)')
  },
  {
    id: 'ecs-merge',
    name: 'ECS S&P (Merge)',
    color: '#0891b2',
    activeByDefault: false,
    createInstance: () => new CustomECSSimulator('merge', 'ecs-merge', 'ECS S&P (Merge)')
  },
  {
    id: 'ecs-native',
    name: 'ECS S&P (Native)',
    color: '#15803d',
    activeByDefault: false,
    createInstance: () => new CustomECSSimulator('native', 'ecs-native', 'ECS S&P (Native)')
  },
  {
    id: 'ecs-tree',
    name: 'ECS Tree',
    color: '#b45309',
    activeByDefault: true,
    createInstance: () => new ECSTreeSimulator('ecs-tree', 'ECS Tree')
  },
  {
    id: 'wasm',
    name: 'WASM ECS S&P (Insertion)',
    color: '#be185d',
    activeByDefault: true,
    createInstance: () => new WasmECSSimulator('insertion', 'wasm', 'WASM ECS S&P (Insertion)')
  },
  {
    id: 'wasm-quick',
    name: 'WASM ECS S&P (Quick)',
    color: '#e11d48',
    activeByDefault: false,
    createInstance: () => new WasmECSSimulator('quick', 'wasm-quick', 'WASM ECS S&P (Quick)')
  },
  {
    id: 'wasm-merge',
    name: 'WASM ECS S&P (Merge)',
    color: '#9d174d',
    activeByDefault: false,
    createInstance: () => new WasmECSSimulator('merge', 'wasm-merge', 'WASM ECS S&P (Merge)')
  }
];
