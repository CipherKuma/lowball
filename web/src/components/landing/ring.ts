import type { BuyerId } from '../../../../shared/api';

/** The five buyers as the landing shows them, each with a line they actually said in a recorded season (take 2, season 49). */
export const RING: { id: BuyerId; name: string; short: string; role: string; line: string }[] = [
  { id: 'marlow', name: 'Marlow Teague', short: 'Marlow', role: 'Harbour boss', line: 'The ice is thick. None of us are swimming.' },
  { id: 'odile', name: 'Odile Fenn', short: 'Odile', role: 'Cannery books', line: 'The ledger balances. The ring holds.' },
  { id: 'sully', name: 'Sully Brack', short: 'Sully', role: 'Dock buyer', line: 'My hands are shaking. Is it just the wind?' },
  { id: 'ines', name: 'Ines Varga', short: 'Ines', role: 'Restaurateur', line: 'Trust is a luxury for those who survive the winter.' },
  { id: 'deacon', name: 'The Deacon', short: 'Deacon', role: 'Middleman', line: 'Sixty. The ring holds.' },
];
