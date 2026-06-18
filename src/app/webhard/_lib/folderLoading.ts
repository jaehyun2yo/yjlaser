export interface FolderPathItem {
  id: string;
  name: string;
  parent_id: string | null;
}

export interface FolderAncestorsResponse {
  ancestors: FolderPathItem[];
  current: FolderPathItem;
}

function appendCompanyId(params: URLSearchParams, companyId?: string | number): void {
  if (companyId !== undefined && companyId !== null && String(companyId) !== '') {
    params.set('companyId', String(companyId));
  }
}

function withQuery(path: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function buildFolderListUrl(options: {
  parentId: string | null;
  companyId?: string | number;
}): string {
  const params = new URLSearchParams();
  if (options.parentId) params.set('parentId', options.parentId);
  appendCompanyId(params, options.companyId);
  return withQuery('/api/webhard/folders', params);
}

export function buildFolderTreeUrl(options: { companyId?: string | number } = {}): string {
  const params = new URLSearchParams();
  appendCompanyId(params, options.companyId);
  return withQuery('/api/webhard/folders/tree', params);
}

export function toBreadcrumbPath(response: FolderAncestorsResponse | null): FolderPathItem[] {
  if (!response) return [];
  return [...response.ancestors, response.current];
}
