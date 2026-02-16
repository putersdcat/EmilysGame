declare module 'pngjs' {
  // Minimal fallback typing for ESM projects when @types/pngjs is unavailable.
  // Keeps TypeScript happy while preserving the runtime import style:
  //   import { PNG } from 'pngjs';
  export const PNG: any;
}
