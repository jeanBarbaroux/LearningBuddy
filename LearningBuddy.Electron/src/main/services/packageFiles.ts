// File dialogs and file access of the Packages page: import, export, template and card images.
import { dialog, type BrowserWindow } from 'electron';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { checkImage, MAX_IMAGE_BYTES } from '../../core/cards/images';
import { LocalizedError } from '../../core/errors';
import { decodePackageFile, MAX_FILE_BYTES, PACKAGE_TEMPLATE, parsePackage } from '../../core/packages/packageFormat';
import type { Language } from '../../core/settings';
import { text } from '../../shared/i18n/i18n';
import type { FileActionResult, ImportPreview } from '../../shared/ipc';

export class PackageFiles {
  constructor(private readonly owner: () => BrowserWindow | null, private readonly language: () => Language) {}

  /** Asks for a package file and parses it; null when the user cancels. */
  async chooseImport(): Promise<ImportPreview | null> {
    const filePath = await this.openFile(text(this.language(), 'SelectImportFileTitle'), [
      { name: this.filterName('ImportFileFilter'), extensions: ['json'] },
    ]);
    if (!filePath) {
      return null;
    }

    const bytes = await this.read(filePath, MAX_FILE_BYTES, () => new LocalizedError('ParserFileTooLarge', [MAX_FILE_BYTES / 1024 / 1024]));
    const content = parsePackage(decodePackageFile(bytes));
    return { fileName: path.basename(filePath), title: content.title, cards: content.cards };
  }

  saveTemplate(): Promise<FileActionResult> {
    return this.save(text(this.language(), 'TemplateSaveTitle'), text(this.language(), 'TemplateFileName'), PACKAGE_TEMPLATE);
  }

  saveExport(fileName: string, json: string): Promise<FileActionResult> {
    return this.save(text(this.language(), 'PackageExportSaveTitle'), fileName, json);
  }

  /** Asks for a PNG or JPEG image of 4 MiB at most; returns its base64 content, or null when cancelled. */
  async chooseImage(): Promise<string | null> {
    const filePath = await this.openFile(text(this.language(), 'CardImageChoose'), [
      { name: 'PNG / JPEG', extensions: ['png', 'jpg', 'jpeg'] },
    ]);
    if (!filePath) {
      return null;
    }

    const bytes = await this.read(filePath, MAX_IMAGE_BYTES, () => new LocalizedError('CardImageInvalid'));
    const base64 = Buffer.from(bytes).toString('base64');
    if (checkImage(base64) !== null) {
      throw new LocalizedError('CardImageInvalid');
    }

    return base64;
  }

  private async openFile(title: string, filters: Electron.FileFilter[]): Promise<string | null> {
    const options: Electron.OpenDialogOptions = { title, filters, properties: ['openFile'] };
    const owner = this.owner();
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : result.filePaths[0] ?? null;
  }

  private async save(title: string, defaultPath: string, content: string): Promise<FileActionResult> {
    const options: Electron.SaveDialogOptions = { title, defaultPath, filters: [{ name: 'JSON', extensions: ['json'] }] };
    const owner = this.owner();
    const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) {
      return { status: 'cancelled' };
    }

    await writeFile(result.filePath, content, 'utf8');
    return { status: 'saved', filePath: result.filePath };
  }

  private async read(filePath: string, maxBytes: number, tooLarge: () => Error): Promise<Uint8Array> {
    try {
      if ((await stat(filePath)).size > maxBytes) {
        throw tooLarge();
      }

      return await readFile(filePath);
    } catch (error) {
      if (error instanceof LocalizedError) {
        throw error;
      }

      throw new LocalizedError('ParserFileUnreadable', [path.basename(filePath)]);
    }
  }

  /** "Paquet JSON LearningBuddy (*.json)|*.json" → "Paquet JSON LearningBuddy". */
  private filterName(key: 'ImportFileFilter'): string {
    return text(this.language(), key).split('|')[0]!.replace(/\s*\(\*\.json\)/, '');
  }
}
