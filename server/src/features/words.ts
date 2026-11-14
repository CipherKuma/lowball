// Numbers spelled out for the narrator (text-to-speech reads "fifty-five" better than "55").
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

export function spell(n: number): string {
  const v = Math.round(n);
  if (v < 0) return `minus ${spell(-v)}`;
  if (v < 20) return ONES[v]!;
  if (v < 100) return TENS[Math.floor(v / 10)]! + (v % 10 ? `-${ONES[v % 10]}` : '');
  if (v < 1000) return `${ONES[Math.floor(v / 100)]} hundred${v % 100 ? ` ${spell(v % 100)}` : ''}`;
  if (v < 1_000_000) return `${spell(Math.floor(v / 1000))} thousand${v % 1000 ? ` ${spell(v % 1000)}` : ''}`;
  return String(v);
}

export const cap1 = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
