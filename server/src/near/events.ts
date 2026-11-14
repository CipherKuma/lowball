// NEP-297 EVENT_JSON log parsing: the game's own events ("lowball") and NEP-245 token events.
export interface ChainEvent {
  standard: string;
  version: string;
  event: string;
  data: Record<string, unknown>[];
}

const PREFIX = 'EVENT_JSON:';

/** Every well-formed EVENT_JSON line; anything malformed is skipped (logs are untrusted text). */
export function parseEventLogs(logs: readonly string[] | undefined): ChainEvent[] {
  const out: ChainEvent[] = [];
  for (const line of logs ?? []) {
    if (!line.startsWith(PREFIX)) continue;
    try {
      const j = JSON.parse(line.slice(PREFIX.length)) as ChainEvent;
      if (typeof j?.standard === 'string' && typeof j.event === 'string' && Array.isArray(j.data)) out.push(j);
    } catch {
      /* ignore */
    }
  }
  return out;
}

export interface TokenMint {
  tokenId: string;
  amount: number;
  owner: string;
}
export interface TokenTransfer {
  tokenId: string;
  from: string;
  to: string;
  amount: number;
  memo?: string;
}

function tokens(e: ChainEvent): { ids: string[]; amounts: string[]; row: Record<string, unknown> }[] {
  return e.data
    .map((row) => ({ ids: row.token_ids as unknown, amounts: row.amounts as unknown, row }))
    .filter((x): x is { ids: string[]; amounts: string[]; row: Record<string, unknown> } => Array.isArray(x.ids) && Array.isArray(x.amounts))
    .map((x) => ({ ids: x.ids.map(String), amounts: x.amounts.map(String), row: x.row }));
}

export function mintsOf(logs: readonly string[] | undefined): TokenMint[] {
  const out: TokenMint[] = [];
  for (const e of parseEventLogs(logs)) {
    if (e.standard !== 'nep245' || e.event !== 'mt_mint') continue;
    for (const t of tokens(e)) t.ids.forEach((id, i) => out.push({ tokenId: id, amount: Number(t.amounts[i]), owner: String(t.row.owner_id) }));
  }
  return out;
}

export function transfersOf(logs: readonly string[] | undefined): TokenTransfer[] {
  const out: TokenTransfer[] = [];
  for (const e of parseEventLogs(logs)) {
    if (e.standard !== 'nep245' || e.event !== 'mt_transfer') continue;
    for (const t of tokens(e)) {
      t.ids.forEach((id, i) =>
        out.push({
          tokenId: id,
          from: String(t.row.old_owner_id),
          to: String(t.row.new_owner_id),
          amount: Number(t.amounts[i]),
          memo: typeof t.row.memo === 'string' ? t.row.memo : undefined,
        }),
      );
    }
  }
  return out;
}
