import { fireEvent, render, screen } from '@testing-library/react';
import {
  CompanyRootFolderDeleteBlockedModal,
  toCompanyRootFolderDeleteBlockedMatch,
} from '@/app/webhard/components/CompanyRootFolderDeleteBlockedModal';

describe('CompanyRootFolderDeleteBlockedModal', () => {
  it('매칭된 폴더명과 업체명을 표시한다', () => {
    render(
      <CompanyRootFolderDeleteBlockedModal
        isOpen={true}
        matches={[
          {
            folderId: 'folder-1',
            folderName: '거래처X',
            companyId: 99,
            companyName: '거래처X 주식회사',
            redirectTo: '/admin/companies/99',
          },
        ]}
        onClose={jest.fn()}
        onGoToCompany={jest.fn()}
      />
    );

    expect(screen.getByRole('dialog', { name: '업체 매칭 폴더는 직접 삭제할 수 없습니다' }));
    expect(screen.getByText('거래처X')).toBeInTheDocument();
    expect(screen.getByText('거래처X 주식회사')).toBeInTheDocument();
  });

  it('매칭 폴더를 제외하고 삭제하는 액션을 제공한다', () => {
    const onDeleteExcludingMatched = jest.fn();

    render(
      <CompanyRootFolderDeleteBlockedModal
        isOpen={true}
        matches={[
          {
            folderId: 'folder-1',
            folderName: '거래처X',
            companyId: 99,
            companyName: '거래처X 주식회사',
          },
        ]}
        canDeleteExcludingMatched={true}
        onClose={jest.fn()}
        onGoToCompany={jest.fn()}
        onDeleteExcludingMatched={onDeleteExcludingMatched}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '제외하고 삭제' }));

    expect(onDeleteExcludingMatched).toHaveBeenCalledTimes(1);
  });

  it('차단 payload를 모달 표시 모델로 변환한다', () => {
    expect(
      toCompanyRootFolderDeleteBlockedMatch({
        companyId: 99,
        companyName: '거래처X 주식회사',
        folderId: 'folder-1',
        folderName: '거래처X',
      })
    ).toEqual({
      companyId: 99,
      companyName: '거래처X 주식회사',
      folderId: 'folder-1',
      folderName: '거래처X',
      redirectTo: '/admin/companies/99',
      message: undefined,
    });
  });
});
