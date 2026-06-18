/**
 * Webhard UI Hooks
 * Portable hooks for file manager UI
 */

// ============ UI Interaction Hooks ============

// Selection (single/multi/range selection)
export { useSelection } from './useSelection';

// Drag selection (mouse rectangle selection)
export { useDragSelection } from './useDragSelection';

// Column resize (adjust column widths)
export { useColumnResize } from './useColumnResize';

// File sort (client-side sorting)
export { useFileSort, isFileNew } from './useFileSort';

// Keyboard shortcuts (ESC, Delete, Ctrl+A, etc.)
export { useKeyboardShortcuts } from './useKeyboardShortcuts';

// Context menu (right-click menu)
export { useContextMenu } from './useContextMenu';

// Sidebar resize (folder tree width)
export { useSidebarResize } from './useSidebarResize';

// ============ Business Logic Hooks ============

// File operations (download, delete, move, rename)
export { useFileOperations } from './useFileOperations';

// File upload (with validation and progress)
export { useFileUpload } from './useFileUpload';

// Batch download (with concurrency control)
export { useBatchDownload } from './useBatchDownload';

// File rename (with optimistic updates)
export { useFileRename } from './useFileRename';
