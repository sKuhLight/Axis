import { paramValue } from '$lib/ui/format';
import { currentLabel, modulationRate, modulationValue, type ModulationGraphSpec } from './modulationGraphs';

export interface LfoSource {
  number: 1 | 2;
  output: 'A' | 'B';
}

export interface ModifierMapping {
  min: number;
  max: number;
  start: number;
  mid: number;
  end: number;
  slope: number;
  scale: number;
  offset: number;
}

export interface LfoModifierVisualization {
  source: LfoSource;
  graph: ModulationGraphSpec;
  mapping: ModifierMapping;
  attackSeconds: number;
  releaseSeconds: number;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function lfoSourceFromName(name: string | undefined): LfoSource | null {
  const match = /^LFO\s*([12])\s*([AB])$/i.exec(name?.trim() ?? '');
  if (!match) return null;
  return { number: Number(match[1]) as 1 | 2, output: match[2]!.toUpperCase() as 'A' | 'B' };
}

export function mapModifierResponse(source: number, mapping: ModifierMapping): number {
  const x = clamp(source);
  const base = x < 0.5
    ? mapping.start + (mapping.mid - mapping.start) * (x * 2)
    : mapping.mid + (mapping.end - mapping.mid) * ((x - 0.5) * 2);
  const shaped = (base - 0.5) * mapping.scale
    + 0.5
    + mapping.offset * 0.4
    + (mapping.slope - 0.5) * 1.2 * (x - 0.5);
  return clamp(shaped);
}

export function mapModifierSource(source: number, mapping: ModifierMapping): number {
  return clamp(mapping.min + mapModifierResponse(source, mapping) * (mapping.max - mapping.min));
}

export function dampedModifierSource(previous: number, next: number, elapsedSeconds: number, attackSeconds: number, releaseSeconds: number): number {
  const seconds = next >= previous ? attackSeconds : releaseSeconds;
  const alpha = seconds > 0 ? (elapsedSeconds > 0 ? 1 - Math.exp(-elapsedSeconds / seconds) : 0) : 1;
  return previous + (next - previous) * alpha;
}

export function lfoModifierSourceValue(spec: LfoModifierVisualization, elapsedSeconds: number, bpm: number): number | null {
  const { graph } = spec;
  const shapeName = currentLabel(graph.type)?.trim();
  if (!shapeName || currentLabel(graph.run)?.trim().toLowerCase() === 'stop') return null;

  const freeRate = graph.rate ? paramValue(graph.rate) : 0.5;
  const rate = Math.max(0.01, modulationRate(Number.isFinite(freeRate) ? freeRate : 0.5, currentLabel(graph.tempo), bpm));
  const phaseOffset = spec.source.output === 'B' && graph.phase ? paramValue(graph.phase) / 360 : 0;
  const phase = elapsedSeconds * rate + phaseOffset;
  const cycle = Math.floor(phase);
  const duty = clamp(graph.duty?.norm ?? 0.5);
  const shape = clamp(graph.shape?.norm ?? 0.5);
  let wave = modulationValue(shapeName, phase, { duty, shape, randomSeed: cycle });

  const quantizeLabel = currentLabel(graph.quantize)?.trim();
  const levels = Number(quantizeLabel);
  if (Number.isFinite(levels) && levels >= 2) {
    wave = (Math.round(((wave + 1) / 2) * (levels - 1)) / (levels - 1)) * 2 - 1;
  }

  const depth = clamp(graph.depth?.norm ?? 1);
  return 0.5 + wave * depth * 0.5;
}

export function lfoModifierValue(spec: LfoModifierVisualization, elapsedSeconds: number, bpm: number): number | null {
  const source = lfoModifierSourceValue(spec, elapsedSeconds, bpm);
  return source == null ? null : mapModifierSource(source, spec.mapping);
}
