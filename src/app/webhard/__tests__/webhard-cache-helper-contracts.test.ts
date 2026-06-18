import type { QueryClient } from '@tanstack/react-query';
import { invalidateAfterFolderMove } from '@/app/webhard/_lib/cacheHelpers';
import { queryKeys } from '@/lib/react-query/queryKeys';

describe('webhard cache helper contracts', () => {
  it('invalidates active folder pages and badge counts after a folder move', () => {
    const invalidateQueries = jest.fn();
    const queryClient = { invalidateQueries } as unknown as QueryClient;

    invalidateAfterFolderMove(queryClient);

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.webhard.folders.all(),
      exact: false,
      refetchType: 'active',
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.webhard.badgeCounts(),
      refetchType: 'active',
    });
  });
});
