import { SCHEMA_VERSION, exportAll, importAll, type FullExport } from './repository';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDateForFilename(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export async function downloadBackup(now: number): Promise<void> {
  const data = await exportAll(now);
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `5x5-backup-${formatDateForFilename(new Date(now))}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export class ImportSchemaMismatchError extends Error {
  fileVersion: number;

  constructor(fileVersion: number) {
    super(`That file is from schema version ${fileVersion}. This app reads version ${SCHEMA_VERSION}.`);
    this.fileVersion = fileVersion;
  }
}

export async function parseBackupFile(file: File): Promise<FullExport> {
  const text = await file.text();
  const data = JSON.parse(text) as FullExport;
  if (data.schemaVersion !== SCHEMA_VERSION) {
    throw new ImportSchemaMismatchError(data.schemaVersion);
  }
  return data;
}

export async function applyImport(data: FullExport): Promise<void> {
  await importAll(data);
}
