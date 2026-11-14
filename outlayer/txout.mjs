// Prints the guest's JSON output of an OutLayer on-chain job, read from the finished transaction.
//   node txout.mjs <tx_hash> <signer_account_id> [rpc_url]
// Why: `outlayer run` waits inside broadcast_tx_commit, which often times out on public testnet RPCs
// while the job still completes. The result is always in the tx's final SuccessValue.
const [tx, signer, rpc = process.env.NEAR_RPC || 'https://test.rpc.fastnear.com'] = process.argv.slice(2);
if (!tx || !signer) {
  console.error('usage: node txout.mjs <tx_hash> <signer_account_id> [rpc_url]');
  process.exit(2);
}
for (let attempt = 0; attempt < 12; attempt++) {
  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tx',
      params: { tx_hash: tx, sender_account_id: signer, wait_until: 'FINAL' },
    }),
  }).catch(() => null);
  const body = res && res.ok ? await res.json().catch(() => null) : null;
  const status = body?.result?.status;
  if (status?.SuccessValue !== undefined) {
    process.stdout.write(Buffer.from(status.SuccessValue, 'base64').toString('utf8') + '\n');
    process.exit(0);
  }
  if (status?.Failure) {
    console.error(JSON.stringify(status.Failure));
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 5000));
}
console.error('no final result yet (RPC rate limit or job still running)');
process.exit(1);
