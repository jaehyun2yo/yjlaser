# Webhard UI Library

Portable, reusable file manager UI components and hooks for React applications.

## Features

- **No external state dependencies** - Props-based, no Zustand required
- **Virtual scrolling** - Efficient rendering for large file lists
- **Drag selection** - Box selection for multiple files
- **Keyboard shortcuts** - ESC, Delete, Ctrl+A support
- **Dark mode ready** - Tailwind CSS dark mode classes
- **TypeScript** - Full type definitions included

## Installation

This library is part of the project. Import from `@/lib/webhard-ui`.

### Peer Dependencies

```bash
pnpm add @tanstack/react-virtual
```

## Quick Start

```tsx
import {
  VirtualFileList,
  Toolbar,
  Breadcrumb,
  useSelection,
  useFileSort,
  type FileDTO,
} from '@/lib/webhard-ui';

function FileManager() {
  const [files, setFiles] = useState<FileDTO[]>([]);

  const { selectedIds, handleSelect, clearSelection } = useSelection({
    onSelectionChange: (ids) => console.log('Selected:', ids.size),
  });

  const { sortedFiles, sortConfig, handleSort } = useFileSort({
    files,
    defaultSortField: 'original_name',
  });

  return (
    <div>
      <Breadcrumb
        items={[{ id: 'root', name: 'Home' }]}
        onNavigate={(id) => console.log('Navigate to:', id)}
      />

      <Toolbar
        actions={[
          { id: 'upload', label: 'Upload', icon: <UploadIcon /> },
          { id: 'delete', label: 'Delete', icon: <TrashIcon /> },
        ]}
        onAction={(id) => console.log('Action:', id)}
      />

      <VirtualFileList
        files={sortedFiles}
        selectedIds={selectedIds}
        renderFileItem={({ file, isSelected, style }) => (
          <div key={file.id} style={style}>
            {file.original_name}
          </div>
        )}
      />
    </div>
  );
}
```

## Components

### Breadcrumb

Folder navigation breadcrumb.

```tsx
<Breadcrumb
  items={[
    { id: 'root', name: 'Home' },
    { id: 'folder1', name: 'Documents' },
  ]}
  onNavigate={(folderId) => {}}
  separator="/"
/>
```

### EmptyState

Empty folder placeholder.

```tsx
<EmptyState
  icon={<FolderIcon />}
  title="No files"
  description="Upload files to get started"
  action={{ label: 'Upload', onClick: () => {} }}
/>
```

### Toolbar

Action button toolbar.

```tsx
<Toolbar
  actions={[
    { id: 'upload', label: 'Upload', icon: <Icon />, variant: 'primary' },
    { id: 'delete', label: 'Delete', icon: <Icon />, disabled: true },
  ]}
  onAction={(actionId) => {}}
/>
```

### ColumnHeader

Sortable table header.

```tsx
<ColumnHeader
  columns={[
    { id: 'name', label: 'Name', sortable: true, width: 200 },
    { id: 'size', label: 'Size', sortable: true },
  ]}
  sortField="name"
  sortDirection="asc"
  onSort={(field) => {}}
  allSelected={false}
  onSelectAll={() => {}}
/>
```

### VirtualFileList / VirtualFileGrid

Virtual scrolling file list.

```tsx
<VirtualFileList
  files={files}
  selectedIds={selectedIds}
  itemHeight={48}
  overscan={10}
  renderFileItem={({ file, isSelected, style }) => (
    <div key={file.id} style={style}>
      {file.original_name}
    </div>
  )}
/>

<VirtualFileGrid
  files={files}
  selectedIds={selectedIds}
  columns={4}
  rowHeight={200}
  renderFileItem={({ file, isSelected }) => (
    <div key={file.id}>{file.original_name}</div>
  )}
/>
```

### FilePreviewTooltip

File hover preview.

```tsx
const { previewState, handleMouseEnter, handleMouseLeave } = useFilePreview(500);

<div onMouseEnter={(e) => handleMouseEnter(file, e)} onMouseLeave={handleMouseLeave}>
  {file.original_name}
</div>

<FilePreviewTooltip
  file={previewState.file!}
  isVisible={previewState.isVisible}
  position={previewState.position}
  onClose={handleMouseLeave}
  getPreviewUrl={async (file) => `/api/preview/${file.id}`}
/>
```

### Other Components

- **SidebarResizer** - Draggable sidebar width control
- **SearchDropdown** - Search results dropdown with keyboard navigation
- **StorageUsage** - Storage quota progress bar
- **FileListSkeleton** - Loading skeleton
- **DragSelection** - Drag selection box overlay

## Hooks

### useSelection

File selection with Shift/Ctrl support.

```tsx
const {
  selectedIds,        // Set<string>
  handleSelect,       // (id, index, shiftKey, ctrlKey) => void
  selectAll,          // (ids) => void
  clearSelection,     // () => void
  isSelected,         // (id) => boolean
} = useSelection({
  initialSelection: new Set(),
  onSelectionChange: (ids) => {},
});
```

### useDragSelection

Drag box selection.

```tsx
const {
  isDragSelecting,
  boundingRect,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
} = useDragSelection({
  containerRef,
  itemSelector: '[data-file-id]',
  getItemId: (el) => el.dataset.fileId,
  onSelectionChange: (ids) => {},
});
```

### useFileSort

Client-side file sorting.

```tsx
const {
  sortedFiles,
  sortConfig,
  handleSort,
} = useFileSort({
  files,
  defaultSortField: 'original_name',
  defaultSortDirection: 'asc',
  onSortChange: (config) => {},
});
```

### useColumnResize

Resizable column widths.

```tsx
const {
  columnWidths,
  handleResizeStart,
  handleResize,
  handleResizeEnd,
} = useColumnResize({
  columns: ['name', 'size', 'date'],
  defaultWidths: { name: 300, size: 100, date: 150 },
  minWidth: 50,
});
```

### useKeyboardShortcuts

Keyboard shortcut handling.

```tsx
useKeyboardShortcuts({
  enabled: true,
  onEscape: () => clearSelection(),
  onDelete: () => deleteSelected(),
  onSelectAll: () => selectAll(fileIds),
});
```

### useContextMenu

Right-click context menu.

```tsx
const {
  contextMenu,      // { isOpen, x, y, targetId }
  openContextMenu,  // (e, targetId) => void
  closeContextMenu, // () => void
} = useContextMenu();
```

### useSidebarResize

Sidebar width management.

```tsx
const {
  sidebarWidth,
  isCollapsed,
  handleResizeStart,
  handleResize,
  handleResizeEnd,
  toggleCollapse,
} = useSidebarResize({
  defaultWidth: 280,
  minWidth: 200,
  maxWidth: 500,
  collapseThreshold: 150,
});
```

### useFileOperations

File CRUD operations.

```tsx
const {
  isLoading,
  createFolder,
  moveFiles,
  deleteFiles,
} = useFileOperations({
  apiEndpoints: {
    createFolder: '/api/webhard/folders',
    moveFiles: '/api/webhard/move',
    deleteFiles: '/api/webhard/delete',
  },
  onSuccess: () => refetch(),
  onError: (error) => toast.error(error.message),
});
```

### useFileUpload

File upload with validation.

```tsx
const {
  isUploading,
  progress,
  uploadFiles,
} = useFileUpload({
  uploadEndpoint: '/api/webhard/upload',
  maxFileSize: 100 * 1024 * 1024, // 100MB
  allowedTypes: ['image/*', 'application/pdf'],
  onProgress: (percent) => {},
  onSuccess: (files) => {},
  onError: (error) => {},
});
```

### useBatchDownload

Concurrent file downloads.

```tsx
const {
  isDownloading,
  progress,
  downloadFiles,
} = useBatchDownload({
  getDownloadUrl: (file) => `/api/webhard/download/${file.id}`,
  concurrency: 3,
  onProgress: (current, total) => {},
  onComplete: () => {},
});
```

### useFileRename

File rename with optimistic update.

```tsx
const {
  isRenaming,
  renameFile,
} = useFileRename({
  renameEndpoint: '/api/webhard/rename',
  onSuccess: (file) => {},
  onError: (error) => {},
});
```

## Types

```tsx
interface FileDTO {
  id: string;
  original_name: string;
  size: number;
  mime_type: string | null;
  folder_id: string | null;
  created_at: string;
  updated_at: string;
  uploader_name?: string;
  company_id?: string | null;
}

interface FolderDTO {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  company_id?: string | null;
}

interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

type SortField = 'original_name' | 'size' | 'created_at' | 'updated_at' | 'uploader_name';
type SortDirection = 'asc' | 'desc';
```

## Customization

### Styling

All components use Tailwind CSS classes. Override with `className` prop:

```tsx
<Breadcrumb className="bg-gray-100 dark:bg-gray-900" />
```

### API Endpoints

Configure endpoints via props:

```tsx
useFileOperations({
  apiEndpoints: {
    createFolder: '/api/my-custom-endpoint/folders',
    moveFiles: '/api/my-custom-endpoint/move',
    deleteFiles: '/api/my-custom-endpoint/delete',
  },
});
```

### Labels

Customize text labels:

```tsx
<EmptyState
  labels={{
    title: 'Empty folder',
    description: 'No files here',
  }}
/>

<FilePreviewTooltip
  labels={{
    loading: 'Loading preview...',
    noPreview: 'Preview not available',
  }}
/>
```

## License

Internal use only.
