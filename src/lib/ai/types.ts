export interface AiRequest {
  system: string;
  text: string;
  image?: Blob;
  audio?: Blob;
  /** JSON Schema the response must satisfy. */
  schema: object;
  signal?: AbortSignal;
  onDownloadProgress?: (fraction: number) => void;
}

export interface AiCapabilities {
  text: boolean;
  image: boolean;
  audio: boolean;
}

export interface AiProvider {
  readonly label: string;
  /** True when the request leaves this device. */
  readonly remote: boolean;
  capabilities(): Promise<AiCapabilities>;
  complete(req: AiRequest): Promise<string>;
}
