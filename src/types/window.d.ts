declare global {
  interface Window {
    showDirectoryPicker(options?: FilePickerOptions): Promise<FileSystemDirectoryHandle>;
  }
}

interface FilePickerOptions {
  id?: string;
  startIn?:
    | FileSystemHandle
    | 'desktop'
    | 'documents'
    | 'downloads'
    | 'music'
    | 'pictures'
    | 'videos';
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
  excludeAcceptAllOption?: boolean;
  multiple?: boolean;
  mode?: 'read' | 'readwrite';
}

export {};
