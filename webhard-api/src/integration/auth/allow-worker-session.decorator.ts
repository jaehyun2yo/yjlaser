import { SetMetadata } from '@nestjs/common';

export const ALLOW_WORKER_SESSION_KEY = 'allowWorkerSession';

export const AllowWorkerSession = () => SetMetadata(ALLOW_WORKER_SESSION_KEY, true);
