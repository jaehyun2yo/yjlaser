export interface DriveProvisioningResultDto {
  company_id: number;
  status: 'pending' | 'ready' | 'failed';
  drive_root_folder_id: string | null;
  error: string | null;
}
