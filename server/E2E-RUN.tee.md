# E2E run (HTTP: Worker + real NEAR AI + real NEAR testnet)

- date: 2026-11-14T10:06:41.237Z, duration 214s
- contract: `lowball-ck.testnet`, season 32, player `pja5v98.lowball-house-ck.testnet`
- buyer decisions: whatever the Worker is configured with (see casefile.model)
- leniency offered by the player key after two identical-bid days; confessor: **sully**
- payout address: none (NEAR payout)
- pact: cap 100, members 5
- NEAR AI receipts: 15, verified 15

## Transactions

| label | signer | ok | hash |
|---|---|---|---|
| create_player | lowball-house-ck.testnet | yes | [D5AYN6cu5WSqHXLi83EhNDTUp5p47MfFMKdt5pEkPQv1](https://testnet.nearblocks.io/txns/D5AYN6cu5WSqHXLi83EhNDTUp5p47MfFMKdt5pEkPQv1) |
| fund marlow | lowball-house-ck.testnet | yes | [BGzbB5mTTTdz7c57ZAEFGuJQcYwsbKGsnZiuDeS92atv](https://testnet.nearblocks.io/txns/BGzbB5mTTTdz7c57ZAEFGuJQcYwsbKGsnZiuDeS92atv) |
| fund odile | lowball-house-ck.testnet | yes | [5mCJWqgab864tjPaLkVLe6X82CiBp389Ape6giLLJBbT](https://testnet.nearblocks.io/txns/5mCJWqgab864tjPaLkVLe6X82CiBp389Ape6giLLJBbT) |
| fund sully | lowball-house-ck.testnet | yes | [4Boqp7ecMTM5z5pMfMv8R7CRMTzAuTMmALA6zc5aR5Jp](https://testnet.nearblocks.io/txns/4Boqp7ecMTM5z5pMfMv8R7CRMTzAuTMmALA6zc5aR5Jp) |
| fund ines | lowball-house-ck.testnet | yes | [4PZ9rgWEtVDGd49JEo23hRczXMAdid2SNjsNbThevws4](https://testnet.nearblocks.io/txns/4PZ9rgWEtVDGd49JEo23hRczXMAdid2SNjsNbThevws4) |
| fund deacon | lowball-house-ck.testnet | yes | [GbG89yGA58eTcdKC8Yx67Z5HUcNDDqxwf9vZp1KFMnMb](https://testnet.nearblocks.io/txns/GbG89yGA58eTcdKC8Yx67Z5HUcNDDqxwf9vZp1KFMnMb) |
| create_season | lowball-house-ck.testnet | yes | [DrCzkBbbjfFFdbzd322Qz6UzJdKTNqaM3SHv9AKuj1VN](https://testnet.nearblocks.io/txns/DrCzkBbbjfFFdbzd322Qz6UzJdKTNqaM3SHv9AKuj1VN) |
| post_bond deacon | deacon.lowball-house-ck.testnet | yes | [3P2eSFmpSomrMXfsC1L6XdasZFaVU42zfnrL3BpyV9qJ](https://testnet.nearblocks.io/txns/3P2eSFmpSomrMXfsC1L6XdasZFaVU42zfnrL3BpyV9qJ) |
| post_bond marlow | marlow.lowball-house-ck.testnet | yes | [Bnp1s4bGYqZvje2pMSLG9YUBhJEUih3fcTbDXSaPnNFX](https://testnet.nearblocks.io/txns/Bnp1s4bGYqZvje2pMSLG9YUBhJEUih3fcTbDXSaPnNFX) |
| post_bond ines | ines.lowball-house-ck.testnet | yes | [c6PPdRUJtV6WL29TLTN2sDmCvfvucRWgUwLSK6iutBx](https://testnet.nearblocks.io/txns/c6PPdRUJtV6WL29TLTN2sDmCvfvucRWgUwLSK6iutBx) |
| post_bond sully | sully.lowball-house-ck.testnet | yes | [GBdJ4bUebQaZJCPH7LeBHCEqXuEpzC2cwovMuz7fqbgY](https://testnet.nearblocks.io/txns/GBdJ4bUebQaZJCPH7LeBHCEqXuEpzC2cwovMuz7fqbgY) |
| post_bond odile | odile.lowball-house-ck.testnet | yes | [BCfM7recBV2omrZ4aKmXL5Gt5NMUVHE6e5vqBJTH7QgF](https://testnet.nearblocks.io/txns/BCfM7recBV2omrZ4aKmXL5Gt5NMUVHE6e5vqBJTH7QgF) |
| open_lot day 1 | lowball-house-ck.testnet | yes | [CuYvzYzH99Gz5F3pxxNu9dhcwqm32By2uTqAhovX7iWG](https://testnet.nearblocks.io/txns/CuYvzYzH99Gz5F3pxxNu9dhcwqm32By2uTqAhovX7iWG) |
| commit_bid sully d1 | sully.lowball-house-ck.testnet | yes | [98noA6eATSWrsHFiBoctnHjWTwZ9dUcuCM8bR4S2Hqfq](https://testnet.nearblocks.io/txns/98noA6eATSWrsHFiBoctnHjWTwZ9dUcuCM8bR4S2Hqfq) |
| commit_bid marlow d1 | marlow.lowball-house-ck.testnet | yes | [3qVWKpdDbNwVnuGX3mdQAp1QwGenW4fjjN2yHjhQ8JYq](https://testnet.nearblocks.io/txns/3qVWKpdDbNwVnuGX3mdQAp1QwGenW4fjjN2yHjhQ8JYq) |
| commit_bid ines d1 | ines.lowball-house-ck.testnet | yes | [BfKCv2MbAGUWPmFgMkdFFQc8LNxTtJyUpQa8JA9hK68T](https://testnet.nearblocks.io/txns/BfKCv2MbAGUWPmFgMkdFFQc8LNxTtJyUpQa8JA9hK68T) |
| commit_bid deacon d1 | deacon.lowball-house-ck.testnet | yes | [AaG8xm3isBsiYRwqpBjzFut8nNie2ZgndTBbcQQQKVM3](https://testnet.nearblocks.io/txns/AaG8xm3isBsiYRwqpBjzFut8nNie2ZgndTBbcQQQKVM3) |
| commit_bid odile d1 | odile.lowball-house-ck.testnet | yes | [EQE1UtxECLCFi4PMYi5ndFFVgtdqhqrvvvyFB6T7Zik](https://testnet.nearblocks.io/txns/EQE1UtxECLCFi4PMYi5ndFFVgtdqhqrvvvyFB6T7Zik) |
| reveal_bid ines d1 | ines.lowball-house-ck.testnet | yes | [CM4Wx7WqS3Gj9i6CjkZVCVs1AeHovBHFW78VbCgxTLMi](https://testnet.nearblocks.io/txns/CM4Wx7WqS3Gj9i6CjkZVCVs1AeHovBHFW78VbCgxTLMi) |
| reveal_bid odile d1 | odile.lowball-house-ck.testnet | yes | [2ZCcySPHQ1UJRRxsH7jQM2EBa4f2to1T2HfeZ2H7Fv3i](https://testnet.nearblocks.io/txns/2ZCcySPHQ1UJRRxsH7jQM2EBa4f2to1T2HfeZ2H7Fv3i) |
| reveal_bid marlow d1 | marlow.lowball-house-ck.testnet | yes | [5Zyr1bEgfYMiq3G6FcDVcWgNEEB4u81bnR3qYq9e5Uvn](https://testnet.nearblocks.io/txns/5Zyr1bEgfYMiq3G6FcDVcWgNEEB4u81bnR3qYq9e5Uvn) |
| reveal_bid sully d1 | sully.lowball-house-ck.testnet | yes | [3L8CFWR6sBQmmFsYCT2N1QdzdoHjscyW43RDixbwbs6H](https://testnet.nearblocks.io/txns/3L8CFWR6sBQmmFsYCT2N1QdzdoHjscyW43RDixbwbs6H) |
| reveal_bid deacon d1 | deacon.lowball-house-ck.testnet | yes | [GzJce4Q6wA15DruVTQnwQwUdLzZRvhP6w1psyn1F925J](https://testnet.nearblocks.io/txns/GzJce4Q6wA15DruVTQnwQwUdLzZRvhP6w1psyn1F925J) |
| settle_lot d1 | lowball-house-ck.testnet | yes | [C6reVEQWVsnrvQzA5jAS2nbZ5rdz5yUyy9ggx3Wm5dA2](https://testnet.nearblocks.io/txns/C6reVEQWVsnrvQzA5jAS2nbZ5rdz5yUyy9ggx3Wm5dA2) |
| open_lot day 2 | lowball-house-ck.testnet | yes | [7rG33Le3HTgiksuA4od7LNPt2mnujPFZHmVvViNgDR4e](https://testnet.nearblocks.io/txns/7rG33Le3HTgiksuA4od7LNPt2mnujPFZHmVvViNgDR4e) |
| commit_bid deacon d2 | deacon.lowball-house-ck.testnet | yes | [BESeGyBoWMj6oYafyFV326PCMqyyZPbBRW5hgYdSDWFk](https://testnet.nearblocks.io/txns/BESeGyBoWMj6oYafyFV326PCMqyyZPbBRW5hgYdSDWFk) |
| commit_bid marlow d2 | marlow.lowball-house-ck.testnet | yes | [49bwqCaA8tFgGGau5R7Tanqw85yxu6KWF782F8XLgAFG](https://testnet.nearblocks.io/txns/49bwqCaA8tFgGGau5R7Tanqw85yxu6KWF782F8XLgAFG) |
| commit_bid sully d2 | sully.lowball-house-ck.testnet | yes | [G21jjCM6X1Wk2R75N7JTHkeB5EUxHHNg6t7WEWUP3sLN](https://testnet.nearblocks.io/txns/G21jjCM6X1Wk2R75N7JTHkeB5EUxHHNg6t7WEWUP3sLN) |
| commit_bid ines d2 | ines.lowball-house-ck.testnet | yes | [7ZQPoKBD99irg4fTyNaxYAFetwwTfDo4vzbP3NtEYkW3](https://testnet.nearblocks.io/txns/7ZQPoKBD99irg4fTyNaxYAFetwwTfDo4vzbP3NtEYkW3) |
| commit_bid odile d2 | odile.lowball-house-ck.testnet | yes | [FdS6cpLZYBcUDvhfVhi6KUiiTqtLB43hJuRBCuxmjE3C](https://testnet.nearblocks.io/txns/FdS6cpLZYBcUDvhfVhi6KUiiTqtLB43hJuRBCuxmjE3C) |
| reveal_bid sully d2 | sully.lowball-house-ck.testnet | yes | [BxPsGh5DSqvQrnTjvmBJgTfTUN8VasL33hxckYkyK6Lc](https://testnet.nearblocks.io/txns/BxPsGh5DSqvQrnTjvmBJgTfTUN8VasL33hxckYkyK6Lc) |
| reveal_bid ines d2 | ines.lowball-house-ck.testnet | yes | [4T5TufKNcEvo6cBmNs2d9YWzfHWvsUVsQd4KZUmx84Ue](https://testnet.nearblocks.io/txns/4T5TufKNcEvo6cBmNs2d9YWzfHWvsUVsQd4KZUmx84Ue) |
| reveal_bid odile d2 | odile.lowball-house-ck.testnet | yes | [BfhBoyFPLqbqcyjETDjoU4mk3w1sKeum5dYkXFFEaawd](https://testnet.nearblocks.io/txns/BfhBoyFPLqbqcyjETDjoU4mk3w1sKeum5dYkXFFEaawd) |
| reveal_bid marlow d2 | marlow.lowball-house-ck.testnet | yes | [J8LifiKRWsZ9rHKcnzPdVVUcN6M9Ccw8ZZ2skwKmSY3U](https://testnet.nearblocks.io/txns/J8LifiKRWsZ9rHKcnzPdVVUcN6M9Ccw8ZZ2skwKmSY3U) |
| reveal_bid deacon d2 | deacon.lowball-house-ck.testnet | yes | [DZq3ZkujwxoeyS5cxzaCsvkW3QceCTzfTBn8u55PjnYZ](https://testnet.nearblocks.io/txns/DZq3ZkujwxoeyS5cxzaCsvkW3QceCTzfTBn8u55PjnYZ) |
| settle_lot d2 | lowball-house-ck.testnet | yes | [6jPFuDjaoY125dPtaaFny5RKCjCg3YTT5fM2KGFhKcUU](https://testnet.nearblocks.io/txns/6jPFuDjaoY125dPtaaFny5RKCjCg3YTT5fM2KGFhKcUU) |
| open_lot day 3 | lowball-house-ck.testnet | yes | [AMHjJnwTHgRVfQJ8kGqWyXw1W1HgBt4r7mYDFZpkfw1D](https://testnet.nearblocks.io/txns/AMHjJnwTHgRVfQJ8kGqWyXw1W1HgBt4r7mYDFZpkfw1D) |
| confess sully | sully.lowball-house-ck.testnet | yes | [2Ad3j5Xk6kRE1qCMTF3rU8qSGSUW7P54fBnyvuxzaBuu](https://testnet.nearblocks.io/txns/2Ad3j5Xk6kRE1qCMTF3rU8qSGSUW7P54fBnyvuxzaBuu) |
| close_season | lowball-house-ck.testnet | yes | [3XTwBD77cnPemmng1L1jD5qKwHTEtr2bLKoDGWUhJafU](https://testnet.nearblocks.io/txns/3XTwBD77cnPemmng1L1jD5qKwHTEtr2bLKoDGWUhJafU) |
| offer_leniency (browser-signed) | pja5v98.lowball-house-ck.testnet | yes | [FmAGUEzVEcBnQGnrXZiWTkJ7gLxqusNXeGKA9bPWoMRq](https://testnet.nearblocks.io/txns/FmAGUEzVEcBnQGnrXZiWTkJ7gLxqusNXeGKA9bPWoMRq) |

## Acts signed inside OutLayer TDX enclaves

| act | buyer | decision | job | request tx | ms | NEAR AI sig (text/ecdsa) | attestation |
|---|---|---|---|---|---|---|---|
| pact | marlow | sign | 44205 | [5pFZ9Tc5Bw2HjUBjvuCyuGn51waWv9RRvWUvHEco32FE](https://testnet.nearblocks.io/txns/5pFZ9Tc5Bw2HjUBjvuCyuGn51waWv9RRvWUvHEco32FE) | 17007 | true/true | https://testnet-api.outlayer.ai/attestations/by-tx/5pFZ9Tc5Bw2HjUBjvuCyuGn51waWv9RRvWUvHEco32FE |
| pact | odile | sign | 44208 | [BGPi4TAdkxfizwcXPHq9zTu8zsmqEcCaqrA1bHJa9yS6](https://testnet.nearblocks.io/txns/BGPi4TAdkxfizwcXPHq9zTu8zsmqEcCaqrA1bHJa9yS6) | 26107 | true/true | https://testnet-api.outlayer.ai/attestations/by-tx/BGPi4TAdkxfizwcXPHq9zTu8zsmqEcCaqrA1bHJa9yS6 |
| pact | sully | sign | 44211 | [8svJj1a9B1kAtfAD1nM4v91HHGpf3vcBSRrkCd2EggeR](https://testnet.nearblocks.io/txns/8svJj1a9B1kAtfAD1nM4v91HHGpf3vcBSRrkCd2EggeR) | 49013 | true/true | https://testnet-api.outlayer.ai/attestations/by-tx/8svJj1a9B1kAtfAD1nM4v91HHGpf3vcBSRrkCd2EggeR |
| pact | ines | sign | 44212 | [GTSG9gqhYZpfEGaTrvw6EDugVQbD2ZFaucuHWYsjeY7X](https://testnet.nearblocks.io/txns/GTSG9gqhYZpfEGaTrvw6EDugVQbD2ZFaucuHWYsjeY7X) | 50159 | true/true | https://testnet-api.outlayer.ai/attestations/by-tx/GTSG9gqhYZpfEGaTrvw6EDugVQbD2ZFaucuHWYsjeY7X |
| pact | deacon | sign | 44213 | [DgGym273RfArTSHPrBBB6vL915y8GXzsPsr2cQMVQcCX](https://testnet.nearblocks.io/txns/DgGym273RfArTSHPrBBB6vL915y8GXzsPsr2cQMVQcCX) | 53127 | true/true | https://testnet-api.outlayer.ai/attestations/by-tx/DgGym273RfArTSHPrBBB6vL915y8GXzsPsr2cQMVQcCX |
| confession | marlow | stay_quiet | 44221 | [J1M92ghDczkiQQDoVzcdAj7finBmiSSvbkqRpAur4hFd](https://testnet.nearblocks.io/txns/J1M92ghDczkiQQDoVzcdAj7finBmiSSvbkqRpAur4hFd) | 15186 | true/true | https://testnet-api.outlayer.ai/attestations/by-tx/J1M92ghDczkiQQDoVzcdAj7finBmiSSvbkqRpAur4hFd |
| confession | odile | stay_quiet | 44222 | [HoK4kaCNZaoqTe7XDMPSgiwHwtKgAmWxNqhNdus7C7uy](https://testnet.nearblocks.io/txns/HoK4kaCNZaoqTe7XDMPSgiwHwtKgAmWxNqhNdus7C7uy) | 18225 | true/true | https://testnet-api.outlayer.ai/attestations/by-tx/HoK4kaCNZaoqTe7XDMPSgiwHwtKgAmWxNqhNdus7C7uy |
| confession | sully | confess | 44223 | [514VNjUNAzLKSvkZ6K3JNm3Nv68zFegouuqPAgLqgj82](https://testnet.nearblocks.io/txns/514VNjUNAzLKSvkZ6K3JNm3Nv68zFegouuqPAgLqgj82) | 20027 | true/true | https://testnet-api.outlayer.ai/attestations/by-tx/514VNjUNAzLKSvkZ6K3JNm3Nv68zFegouuqPAgLqgj82 |
| confession | deacon | stay_quiet | 44225 | [AsZdsAkJSjX8uqHQhpPxfXcMGm7H8dyAjZGU9gZj8aX9](https://testnet.nearblocks.io/txns/AsZdsAkJSjX8uqHQhpPxfXcMGm7H8dyAjZGU9gZj8aX9) | 26901 | true/true | https://testnet-api.outlayer.ai/attestations/by-tx/AsZdsAkJSjX8uqHQhpPxfXcMGm7H8dyAjZGU9gZj8aX9 |
| confession | ines | stay_quiet | 44224 | [CkJkVruNKHobgXshidJyuaN4oG9923zwtpBNzAQc3yLb](https://testnet.nearblocks.io/txns/CkJkVruNKHobgXshidJyuaN4oG9923zwtpBNzAQc3yLb) | 27846 | true/true | https://testnet-api.outlayer.ai/attestations/by-tx/CkJkVruNKHobgXshidJyuaN4oG9923zwtpBNzAQc3yLb |

## Event types in order

```
1 account_created
2 season_created
3 bond_posted
4 bond_posted
5 bond_posted
6 bond_posted
7 bond_posted
8 cartel_forming
9 tee_signed
10 tee_signed
11 tee_signed
12 tee_signed
13 tee_signed
14 rumour
15 day_opened
16 lot_minted
17 bid_committed
18 bid_committed
19 bid_committed
20 bid_committed
21 bid_committed
22 bids_revealed
23 line
24 line
25 line
26 line
27 line
28 lot_settled
29 lot_transferred
30 day_opened
31 lot_minted
32 bid_committed
33 bid_committed
34 bid_committed
35 bid_committed
36 bid_committed
37 bids_revealed
38 line
39 line
40 line
41 line
42 line
43 lot_settled
44 lot_transferred
45 day_opened
46 lot_minted
47 leniency_open
48 deliberating
49 deliberating
50 deliberating
51 deliberating
52 deliberating
53 tee_signed
54 line
55 tee_signed
56 line
57 tee_signed
58 line
59 confession_attempt
60 tee_signed
61 line
62 tee_signed
63 line
64 slashed
65 season_closed
```

## Final on-chain season

```json
{
  "season_id": 32,
  "player": "pja5v98.lowball-house-ck.testnet",
  "buyers": [
    "marlow.lowball-house-ck.testnet",
    "odile.lowball-house-ck.testnet",
    "sully.lowball-house-ck.testnet",
    "ines.lowball-house-ck.testnet",
    "deacon.lowball-house-ck.testnet"
  ],
  "bonds": [
    {
      "buyer": "marlow.lowball-house-ck.testnet",
      "posted": true,
      "slashed": true,
      "refunded": false
    },
    {
      "buyer": "odile.lowball-house-ck.testnet",
      "posted": true,
      "slashed": true,
      "refunded": false
    },
    {
      "buyer": "sully.lowball-house-ck.testnet",
      "posted": true,
      "slashed": false,
      "refunded": true
    },
    {
      "buyer": "ines.lowball-house-ck.testnet",
      "posted": true,
      "slashed": true,
      "refunded": false
    },
    {
      "buyer": "deacon.lowball-house-ck.testnet",
      "posted": true,
      "slashed": true,
      "refunded": false
    }
  ],
  "bond": "100000000000000000000000",
  "day": 3,
  "days": 6,
  "status": "Closed",
  "lots": [
    {
      "day": 1,
      "species": "halibut",
      "fair_value": 214,
      "weight_kg": 111,
      "token_id": "s32-d1",
      "token_owner": "ines.lowball-house-ck.testnet",
      "committed": [],
      "reveals": [
        {
          "buyer": "ines.lowball-house-ck.testnet",
          "amount": 100
        },
        {
          "buyer": "deacon.lowball-house-ck.testnet",
          "amount": 100
        },
        {
          "buyer": "sully.lowball-house-ck.testnet",
          "amount": 100
        },
        {
          "buyer": "marlow.lowball-house-ck.testnet",
          "amount": 100
        },
        {
          "buyer": "odile.lowball-house-ck.testnet",
          "amount": 100
        }
      ],
      "settled": true,
      "winner": "ines.lowball-house-ck.testnet",
      "price": 100,
      "identical": true
    },
    {
      "day": 2,
      "species": "monkfish",
      "fair_value": 164,
      "weight_kg": 115,
      "token_id": "s32-d2",
      "token_owner": "ines.lowball-house-ck.testnet",
      "committed": [],
      "reveals": [
        {
          "buyer": "ines.lowball-house-ck.testnet",
          "amount": 100
        },
        {
          "buyer": "sully.lowball-house-ck.testnet",
          "amount": 100
        },
        {
          "buyer": "odile.lowball-house-ck.testnet",
          "amount": 100
        },
        {
          "buyer": "marlow.lowball-house-ck.testnet",
          "amount": 100
        },
        {
          "buyer": "deacon.lowball-house-ck.testnet",
          "amount": 100
        }
      ],
      "settled": true,
      "winner": "ines.lowball-house-ck.testnet",
      "price": 100,
      "identical": true
    },
    {
      "day": 3,
      "species": "lobster",
      "fair_value": 216,
      "weight_kg": 26,
      "token_id": "s32-d3",
      "token_owner": "pja5v98.lowball-house-ck.testnet",
      "committed": [],
      "reveals": [],
      "settled": false,
      "winner": null,
      "price": 0,
      "identical": false
    }
  ],
  "leniency_day": 3,
  "leniency_open": false,
  "leniency_open_block": null,
  "leniency_deadline_block": null,
  "holdouts": 0,
  "leniency_windows": 1,
  "payout_evm": null,
  "payout_route": "near",
  "first_confessor": "sully.lowball-house-ck.testnet",
  "verified_signers": [
    "marlow.lowball-house-ck.testnet",
    "odile.lowball-house-ck.testnet",
    "sully.lowball-house-ck.testnet",
    "ines.lowball-house-ck.testnet",
    "deacon.lowball-house-ck.testnet"
  ],
  "slashed_total": "400000000000000000000000",
  "player_payout": "400000000000000000000000",
  "shortfall": 178,
  "pact_cap": 100,
  "pact_nonce": "2817753920923282",
  "confessed_day": 3
}
```
