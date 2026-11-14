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

const toHex = (t: string) => '0x' + Array.from(new TextEncoder().encode(t), (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * EIP-191 message signature by exactly `address`, through whichever injected provider holds that account.
 * The Ethereum Wallets executor lives in a popup on another origin and exposes no message signing, so the page's own
 * provider signs. Throws EvmError when no injected wallet is on that address (a WalletConnect-only user lands here).
 */
export async function personalSignAs(address: string, text: string): Promise<string> {
  const want = address.toLowerCase();
  const announced = await discover();
  const injected = (window as unknown as { ethereum?: Eip1193 }).ethereum;
  const providers = [...announced.map((a) => a.provider), ...(injected ? [injected] : [])];
  if (!providers.length) throw new EvmError('No Ethereum wallet in this browser can sign the sign-in message. Open Lowball in the browser where MetaMask is installed.');
  for (const p of providers) {
    try {
      let accounts = (await p.request({ method: 'eth_accounts' })) as string[];
      if (!accounts?.some((a) => a.toLowerCase() === want)) accounts = (await p.request({ method: 'eth_requestAccounts' })) as string[];
      if (!accounts?.some((a) => a.toLowerCase() === want)) continue;
      const sig = (await p.request({ method: 'personal_sign', params: [toHex(text), want] })) as string;
      if (!/^0x[0-9a-fA-F]{130}$/.test(sig)) throw new EvmError('The Ethereum wallet returned an unusable signature.');
      return sig;
    } catch (e) {
      if (e instanceof EvmError) throw e;
      if ((e as { code?: number })?.code === 4001) throw new EvmError('You closed the wallet before signing. Nothing was sent. Try again when you are ready.');
    }
  }
  throw new EvmError(`Your browser's Ethereum wallet is not on ${shortAddress(address)}. Switch MetaMask to that account and try again.`);
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
