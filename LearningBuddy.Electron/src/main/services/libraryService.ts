// Packages bundled with the application (assets/default-packages/*.json). Each file is read like an
// imported package; its name without extension identifies the library entry.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { LocalizedError } from '../../core/errors';
import type { PackageContent } from '../../core/model';
import { decodePackageFile, parsePackage } from '../../core/packages/packageFormat';
import { compareOrdinal } from '../../core/text';

export interface LibraryEntry {
  readonly id: string;
  readonly content: PackageContent;
}

export class LibraryService {
  private loading: Promise<LibraryEntry[]> | null = null;

  constructor(private readonly directory: string) {}

  /** Loads the library once, in the background; a single unreadable file fails the whole load (v1). */
  load(): Promise<LibraryEntry[]> {
    this.loading ??= this.readEntries().catch((error: unknown) => {
      this.loading = null;
      throw error;
    });
    return this.loading;
  }

  async find(id: string): Promise<LibraryEntry> {
    const entry = (await this.load()).find((candidate) => candidate.id === id);
    if (!entry) {
      throw new LocalizedError('LibraryEmpty');
    }

    return entry;
  }

  private async readEntries(): Promise<LibraryEntry[]> {
    const files = (await readdir(this.directory))
      .filter((file) => file.toLowerCase().endsWith('.json'))
      .sort(compareOrdinal);
    const entries: LibraryEntry[] = [];
    for (const file of files) {
      const content = parsePackage(decodePackageFile(await readFile(path.join(this.directory, file))));
      entries.push({ id: path.parse(file).name, content });
    }

    return entries;
  }
}
