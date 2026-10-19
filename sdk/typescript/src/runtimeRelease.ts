/** Immutable metadata embedded into published packages by the release builder. */
export interface RuntimeRelease {
  version: string;
  sdkSha: string;
  manifestUrl: string;
  manifestSha256: string;
  protocol: number;
}

/** Source checkouts have no implicit binary download; release packages pin a verified kit. */
export const runtimeRelease: RuntimeRelease | null = null;
