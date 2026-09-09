// large file storage
// bypass ram limits

interface FileSystemSyncAccessHandle {
  write(buffer: BufferSource, options?: { at?: number }): number;
  flush(): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemFileHandleExtensions extends FileSystemFileHandle {
  createSyncAccessHandle(): Promise<FileSystemSyncAccessHandle>;
}

export class OPFSStorage {
  private root: FileSystemDirectoryHandle;
  private handle: FileSystemFileHandle;
  private accessHandle: FileSystemSyncAccessHandle | null; // sync access
  private writable: FileSystemWritableFileStream | null; // writable stream
  public filename: string;

  constructor(
    root: FileSystemDirectoryHandle,
    handle: FileSystemFileHandle,
    accessHandle: FileSystemSyncAccessHandle | null,
    writable: FileSystemWritableFileStream | null
  ) {
    this.root = root;
    this.handle = handle;
    this.accessHandle = accessHandle;
    this.writable = writable;
    this.filename = handle.name;
  }

  static async init(
    filename: string,
    useSync = false
  ): Promise<OPFSStorage | null> {
    if (!navigator.storage?.getDirectory) {
      throw new Error('OPFS not supported');
    }

    try {
      const root = await navigator.storage.getDirectory();
      const processingDir = await root.getDirectoryHandle(
        'phantom-processing',
        { create: true }
      );

      const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${filename}`;
      const handle = await processingDir.getFileHandle(uniqueName, {
        create: true,
      });

      let accessHandle: FileSystemSyncAccessHandle | null = null;
      let writable: FileSystemWritableFileStream | null = null;

      // sync access worker
      if (
        useSync &&
        'createSyncAccessHandle' in (handle as FileSystemFileHandle)
      ) {
        const extHandle = handle as FileSystemFileHandleExtensions;
        accessHandle = await extHandle.createSyncAccessHandle();
      } else {
        writable = await handle.createWritable();
      }

      return new OPFSStorage(processingDir, handle, accessHandle, writable);
    } catch (err) {
      console.error('[OPFS] Init failed:', err);
      return null;
    }
  }

  write(
    chunk: BufferSource,
    offset: number | null = null
  ): Promise<number | undefined> {
    if (this.accessHandle) {
      // sync header write
      return Promise.resolve(
        this.accessHandle.write(chunk, {
          at: offset !== null ? offset : undefined,
        })
      );
    } else if (this.writable) {
      // async stream write
      if (offset !== null) {
        return this.writable
          .write({
            type: 'write',
            position: offset,
            data: chunk,
          })
          .then(() => undefined);
      }
      return this.writable.write(chunk).then(() => undefined);
    }
    return Promise.reject(new Error('No writable handle'));
  }

  async close() {
    try {
      if (this.accessHandle) {
        await this.accessHandle.flush();
        await this.accessHandle.close();
        this.accessHandle = null;
      }
      if (this.writable) {
        await this.writable.close();
        this.writable = null;
      }
    } catch (_e) {
      // ignore close errors
    }
  }

  async getFile() {
    await this.close();
    return await this.handle.getFile();
  }

  async delete() {
    try {
      await this.close();
      await this.root.removeEntry(this.filename);
    } catch (_e) {
      // ignore delete errors
    }
  }

  static async clearAll() {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('phantom-processing', { recursive: true });
    } catch (_e) {
      /* ignore */
    }
  }
}
