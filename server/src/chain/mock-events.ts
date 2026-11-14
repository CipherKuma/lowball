// EVENT_JSON log lines exactly as the contract emits them (contract/INTERFACE.md), for the mock chain.
export function mockEvent(standard: 'lowball' | 'nep245', event: string, data: Record<string, unknown>): string {
  return `EVENT_JSON:${JSON.stringify({ standard, version: '1.0.0', event, data: [data] })}`;
}
