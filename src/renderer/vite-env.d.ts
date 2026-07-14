/// <reference types="vite/client" />

import type { PhotoMetadataApi } from '../shared/types';

declare global {
  interface Window {
    photoMeta: PhotoMetadataApi;
  }
}

