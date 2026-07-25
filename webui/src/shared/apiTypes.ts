export interface OkResponse {
  ok: true;
}

/**
 * Response of `POST /api/auth/pair-token` — a freshly minted QR pairing token.
 * The plaintext appears only here; the server stores sha256(token).
 */
export interface PairTokenResponse {
  token: string;
  expiresAt: string;
}

/**
 * Response of `GET /api/settings/pair-info` — addresses a phone could reach this server on.
 */
export interface PairInfoResponse {
  origins: string[];
}


export interface InitialCredentialsResponse {
  username: string;
  password: string | null;
  /** Renderer-normalized alias for older/newer callers. */
  initial_password?: string | null;
}

export interface BookmarkResponse {
  id: number;
  page: number;
  note: string | null;
  createdAt: string;
}

export interface HistoryEntryResponse {
  id: number;
  comicId: number;
  comicTitle: string;
  action: string;
  page: number | null;
  timestamp: string;
}

export interface HistoryResponse {
  entries: HistoryEntryResponse[];
  totalCount: number;
}

export interface IngestErrorLogEntryResponse {
  ts: string;
  path: string;
  ext: string;
  errorClass: string;
  message: string;
}

export interface IngestErrorLogResponse {
  count: number;
  recent: IngestErrorLogEntryResponse[];
}
