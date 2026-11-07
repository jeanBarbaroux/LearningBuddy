// Bundled learning packages offered in the library (LearningBuddy.Infrastructure/PackageLibrary.cs).
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parsePackage } from '../core/packageParser';
import type { ImportedPackage } from '../core/types';

export interface LibraryPackage {
  readonly id: string;
  readonly package: ImportedPackage;
}

export class PackageLibrary {
  private cache: LibraryPackage[] | null = null;

  constructor(readonly directory: string) { }

  load(): LibraryPackage[] {
    this.cache ??= readdirSync(this.directory)
      .filter((file) => file.endsWith('.json'))
      .sort()
      .map((file) => ({
        id: path.basename(file, '.json'),
        package: parsePackage(readFileSync(path.join(this.directory, file), 'utf8')),
      }));
    return this.cache;
  }

  find(id: string): LibraryPackage | null {
    return this.load().find((entry) => entry.id === id) ?? null;
  }
}
