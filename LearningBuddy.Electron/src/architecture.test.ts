import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourceRoot = path.dirname(fileURLToPath(import.meta.url));
const files = sourceFiles(sourceRoot).filter((file) => !file.endsWith('.test.ts'));

interface ModuleReference {
  readonly specifier: string;
  readonly typeOnly: boolean;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(file);
    }

    return /\.(ts|tsx)$/.test(entry.name) ? [file] : [];
  });
}

function moduleReferences(file: string): ModuleReference[] {
  const source = readFileSync(file, 'utf8');
  const fromPattern = /^[ \t]*(?:import|export)[ \t]+(type[ \t]+)?((?:(?!^[ \t]*(?:import|export)\b)[\s\S])*?)\s+from\s+(['"])([^'"]+)\3[ \t]*;?/gm;
  const references = [...source.matchAll(fromPattern)].map((match) => {
    const bindings = match[2]!.trim().match(/^\{\s*([\s\S]*?)\s*\}$/)?.[1];
    const allBindingsAreTypes = bindings !== undefined && bindings.split(',').every((binding) => /^\s*type\s+/.test(binding));
    return { specifier: match[4]!, typeOnly: match[1] !== undefined || allBindingsAreTypes };
  });
  const sideEffectPattern = /^[ \t]*import[ \t]+(['"])([^'"]+)\1[ \t]*;?/gm;
  references.push(...[...source.matchAll(sideEffectPattern)].map((match) => ({ specifier: match[2]!, typeOnly: false })));
  return references;
}

function layerOf(file: string): string {
  return path.relative(sourceRoot, file).split(path.sep)[0]!;
}

function targetLayer(file: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) {
    return null;
  }

  return path.relative(sourceRoot, path.resolve(path.dirname(file), specifier)).split(path.sep)[0]!;
}

function filesInLayer(layer: string): string[] {
  return files.filter((file) => layerOf(file) === layer);
}

function targetPath(file: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) {
    return null;
  }

  return path.relative(sourceRoot, path.resolve(path.dirname(file), specifier)).split(path.sep).join('/');
}

describe('architecture boundaries', () => {
  it('keeps core independent from Electron, Node.js and process-specific code', () => {
    for (const file of filesInLayer('core')) {
      for (const reference of moduleReferences(file)) {
        expect(reference.specifier, file).not.toMatch(/^(electron|node:)/);
        const target = targetLayer(file, reference.specifier);
        expect(target, `${file} imports ${reference.specifier}`).not.toBe('main');
        expect(target, `${file} imports ${reference.specifier}`).not.toBe('preload');
        expect(target, `${file} imports ${reference.specifier}`).not.toBe('renderer');
        if (target === 'shared') {
          expect(reference.typeOnly, `${file} must not load shared code`).toBe(true);
          expect(targetPath(file, reference.specifier)).toMatch(/shared\/i18n\/texts$/);
        }
      }
    }
  });

  it('keeps Electron APIs and process code out of the renderers', () => {
    for (const file of filesInLayer('renderer')) {
      for (const reference of moduleReferences(file)) {
        expect(reference.specifier, file).not.toMatch(/^(electron|node:)/);
        const target = targetLayer(file, reference.specifier);
        expect(target, `${file} imports ${reference.specifier}`).not.toBe('main');
        expect(target, `${file} imports ${reference.specifier}`).not.toBe('preload');
      }
    }
  });

  it('keeps reusable React components independent of individual windows', () => {
    for (const file of files.filter((candidate) => candidate.startsWith(path.join(sourceRoot, 'renderer', 'react') + path.sep))) {
      for (const reference of moduleReferences(file)) {
        const target = targetPath(file, reference.specifier);
        if (target !== null) {
          expect(target, `${file} imports ${reference.specifier}`).not.toMatch(/^renderer\/(main|bubble|companion|invitation|image)(\/|$)/);
        }
      }
    }
  });

  it('keeps the preload limited to Electron and the IPC contract', () => {
    for (const file of filesInLayer('preload')) {
      for (const reference of moduleReferences(file)) {
        if (reference.specifier === 'electron') {
          continue;
        }

        expect(targetPath(file, reference.specifier), `${file} imports ${reference.specifier}`).toBe('shared/ipc');
      }
    }
  });

  it('keeps shared code free of process-specific dependencies', () => {
    for (const file of filesInLayer('shared')) {
      for (const reference of moduleReferences(file)) {
        expect(reference.specifier, file).not.toMatch(/^(electron|node:)/);
        const target = targetLayer(file, reference.specifier);
        expect(target, `${file} imports ${reference.specifier}`).not.toBe('main');
        expect(target, `${file} imports ${reference.specifier}`).not.toBe('preload');
        expect(target, `${file} imports ${reference.specifier}`).not.toBe('renderer');
      }
    }
  });

  it('keeps the main process independent of renderer and preload implementations', () => {
    for (const file of filesInLayer('main')) {
      for (const reference of moduleReferences(file)) {
        const target = targetLayer(file, reference.specifier);
        expect(target, `${file} imports ${reference.specifier}`).not.toBe('preload');
        expect(target, `${file} imports ${reference.specifier}`).not.toBe('renderer');
      }
    }
  });
});