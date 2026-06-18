import { FolderResponseDto } from './folder.dto';

// Response DTOs
export interface FolderAncestorsResponseDto {
  ancestors: FolderResponseDto[];
  current: FolderResponseDto;
}
