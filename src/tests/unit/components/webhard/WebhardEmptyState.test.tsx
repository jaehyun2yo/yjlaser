import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { WebhardEmptyState } from '@/app/webhard/components/WebhardEmptyState';

describe('WebhardEmptyState', () => {
  it('shows the empty-folder copy for normal empty folders', () => {
    render(<WebhardEmptyState isNewFilesMode={false} />);

    expect(screen.getByText('업로드된 파일이 없습니다')).toBeInTheDocument();
  });

  it('shows the new-file empty copy in new-files mode', () => {
    render(<WebhardEmptyState isNewFilesMode />);

    expect(screen.getByText('새 파일이 없습니다')).toBeInTheDocument();
  });
});
