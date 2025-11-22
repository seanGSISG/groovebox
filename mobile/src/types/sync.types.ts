export interface SyncPongPayload {
  clientT0: number;
  serverT1: number;
  serverT2: number;
}

export interface SyncMetrics {
  offset: number;
  rtt: number;
}
