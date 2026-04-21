export enum UploadStatus {
  PENDING   = 'pending',
  SCANNING  = 'scanning',
  COMPLETE  = 'complete',
  FAILED    = 'failed',
  REJECTED  = 'rejected',
}

export enum UploadedByRole {
  CLIENT                    = 'client',
  STAFF                     = 'staff',
  STAFF_ON_BEHALF_OF_CLIENT = 'staff_on_behalf_of_client',
}
