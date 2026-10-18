import { appConfig } from './config';
import { createDemoAdapter } from './demoAdapter';
import { createHttpAdapter } from './httpAdapter';
import type { ResumeDeskService } from './service';

/** The adapter is chosen once, from build-time config — never switched at runtime on failure. */
export function createService(): ResumeDeskService {
  return appConfig.mode === 'demo' ? createDemoAdapter() : createHttpAdapter();
}

export type { ResumeDeskService } from './service';
export { ApiError, toApiError, isAbort, friendlyMessage } from './errors';
