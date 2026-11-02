export const MAX_RESUME_FILE_SIZE_MB = 3;
export const MAX_RESUME_FILE_SIZE_BYTES = MAX_RESUME_FILE_SIZE_MB * 1024 * 1024;

// Includes the 3 MB file plus multipart fields and protocol overhead.
export const MAX_REQUEST_SIZE_MB = 4;
export const MAX_REQUEST_SIZE_BYTES = MAX_REQUEST_SIZE_MB * 1024 * 1024;
