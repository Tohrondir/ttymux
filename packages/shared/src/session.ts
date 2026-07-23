export interface ViewerInfo {
  clientId: string;
  displayName?: string;
  connectedAt: string;
  isWriter: boolean;
}

export interface WriteTokenState {
  holder: string | null;
  holderName?: string;
  since?: string;
  /** Per-console toggle. When true, input is accepted from any viewer without holding the token. Default false. */
  freeForAll: boolean;
}
