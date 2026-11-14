/**
 * The player's own Ethereum address for the Chain Signatures payout, read from their injected wallet
 * (EIP-6963 discovery, falling back to window.ethereum; EIP-1193 eth_requestAccounts). Nothing is signed here:
 * the payout desk signs on Sepolia through NEAR's MPC network and sends to this address.
 */
interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}
interface Announce {
  info: { name: string; rdns: string };
  provider: Eip1193;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function discover(timeoutMs = 300): Promise<Announce[]> {
  return new Promise((resolve) => {
    const found: Announce[] = [];
    const onAnnounce = (e: Event) => found.push((e as CustomEvent<Announce>).detail);
    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    window.setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
      resolve(found);
    }, timeoutMs);
  });
}

export class EvmError extends Error {}

/** Asks the browser's Ethereum wallet for an account. Resolves `{ address, wallet }` or throws EvmError with a player-facing message. */
export async function connectEthereum(): Promise<{ address: string; wallet: string }> {
  const announced = await discover();
  const injected = (window as unknown as { ethereum?: Eip1193 }).ethereum;
  const pick = announced[0] ?? (injected ? { info: { name: 'Browser wallet', rdns: 'injected' }, provider: injected } : null);
  if (!pick) throw new EvmError('No Ethereum wallet in this browser. Install one (MetaMask, Rabby, HOT…) or keep the NEAR payout.');
  try {
    const accounts = (await pick.provider.request({ method: 'eth_requestAccounts' })) as string[];
    const address = accounts?.[0];
    if (!address || !ADDRESS.test(address)) throw new EvmError('That wallet returned no Ethereum account.');
    return { address, wallet: pick.info.name };
  } catch (e) {
    if (e instanceof EvmError) throw e;
    const code = (e as { code?: number })?.code;
    throw new EvmError(code === 4001 ? 'You closed the wallet. The payout stays in NEAR.' : 'The Ethereum wallet did not answer. Try again.');
  }
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
