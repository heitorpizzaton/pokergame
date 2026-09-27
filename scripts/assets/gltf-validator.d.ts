/** Minimal types for the parts of gltf-validator used by check.ts. */
declare module 'gltf-validator' {
  interface Message {
    readonly code: string;
    readonly message: string;
    /** 0 error, 1 warning, 2 info, 3 hint. */
    readonly severity: number;
  }
  interface Report {
    readonly issues: {
      readonly numErrors: number;
      readonly numWarnings: number;
      readonly messages: readonly Message[];
    };
  }
  export function validateBytes(data: Uint8Array): Promise<Report>;
}
