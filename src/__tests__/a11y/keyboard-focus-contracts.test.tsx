import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FolderUploadModal } from '@/app/webhard/components/FolderUploadModal';

jest.mock('@/app/actions/webhard-folder-upload', () => ({
  createFolderStructureAction: jest.fn(),
}));

jest.mock('@/lib/utils/uploadQueue', () => ({
  uploadFilesBatch: jest.fn(),
}));

function renderFolderUploadModal(onClose = jest.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <FolderUploadModal
        isOpen
        onClose={onClose}
        targetFolderId="folder-1"
        onUploadComplete={jest.fn()}
        userType="company"
      />
    </QueryClientProvider>
  );

  return { onClose };
}

describe('keyboard and focus contracts', () => {
  it('exposes the folder upload modal as a labelled dialog with named close control', () => {
    renderFolderUploadModal();

    expect(screen.getByRole('dialog', { name: '폴더 업로드' })).toHaveAttribute(
      'aria-modal',
      'true'
    );
    expect(screen.getByRole('button', { name: '폴더 업로드 닫기' })).toBeInTheDocument();
  });

  it('closes the idle folder upload modal with Escape', async () => {
    const user = userEvent.setup();
    const { onClose } = renderFolderUploadModal();

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab focus inside the idle folder upload modal', async () => {
    const user = userEvent.setup();
    renderFolderUploadModal();

    const closeButton = screen.getByRole('button', { name: '폴더 업로드 닫기' });
    const cancelButton = screen.getByRole('button', { name: '취소' });

    closeButton.focus();
    await user.tab({ shift: true });
    expect(cancelButton).toHaveFocus();

    await user.tab();
    expect(closeButton).toHaveFocus();
  });
});
