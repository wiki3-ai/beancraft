// Local file access. Uses the File System Access API (Chrome/Edge) to save
// back to the original file; otherwise falls back to a download.

interface WritableFileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  requestPermission?(opts: { mode: 'readwrite' }): Promise<PermissionState>;
}

export interface OpenedLedger {
  name: string;
  text: string;
  handle: WritableFileHandle | null;
}

type PickerWindow = typeof globalThis & {
  showOpenFilePicker?: (opts: unknown) => Promise<WritableFileHandle[]>;
};

const LEDGER_EXT = /\.(beancount|bean|ledger|txt)$/i;

export const isLedgerFile = (f: File) => LEDGER_EXT.test(f.name);
export const isImageFile = (f: File) => f.type.startsWith('image/');

export async function pickLedger(): Promise<OpenedLedger | null> {
  const w = globalThis as PickerWindow;
  if (w.showOpenFilePicker) {
    try {
      const [handle] = await w.showOpenFilePicker({
        types: [{ description: 'Beancount ledger', accept: { 'text/plain': ['.beancount', '.bean', '.txt'] } }],
      });
      const file = await handle.getFile();
      return { name: file.name, text: await file.text(), handle };
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return null;
      throw e;
    }
  }
  return null;
}

/**
 * Read a dropped item, keeping a writable handle where the browser supports it.
 * Must be called synchronously from the drop handler: items are invalidated
 * once the event handler returns, so both accessors are invoked before awaiting.
 */
export async function fromDataTransferItem(item: DataTransferItem): Promise<OpenedLedger | null> {
  const withHandle = item as DataTransferItem & { getAsFileSystemHandle?: () => Promise<unknown> };
  const handlePromise = withHandle.getAsFileSystemHandle?.();
  const file = item.getAsFile();
  const handle = ((await handlePromise?.catch(() => null)) ?? null) as WritableFileHandle | null;
  if (!file) return null;
  const writable = handle && typeof handle.createWritable === 'function' ? handle : null;
  return { name: file.name, text: await file.text(), handle: writable };
}

export async function saveToHandle(handle: WritableFileHandle, text: string): Promise<void> {
  if (handle.requestPermission && (await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') {
    throw new Error('Permission to write the file was denied');
  }
  const w = await handle.createWritable();
  await w.write(text);
  await w.close();
}

export function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
