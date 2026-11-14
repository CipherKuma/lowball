# X post — Lowball (Gabriel posts from @CipherKuma; agents never post)

Frame: account @CipherKuma (hackathon persona); reader = NEAR hackathon judges and NEAR builders; goal = a public post
that meets the event rule (says "built at NEAR HACKATHON", tags @NEARProtocol and #NEARHackathon, video attached) and
gets people to play. Voice: plain and specific (no approved CipherKuma voice samples; provisional).

## Post (attach the video)

```
Five AI buyers rig your fish auction. You can't outbid a cartel. Make one talk.

Lowball, built at NEAR HACKATHON: you sign leniency in your NEAR wallet. First to confess walks free; the rest lose their bonds to you.

play.lowball-game.pages.dev
@NEARProtocol #NEARHackathon
```

- **Video file:** `~/Documents/hackathons/near-lowball/demo/out/lowball-demo.mp4`, 2:15 (135 s, under X's 2:20 limit for
  standard accounts), 1920×1080 H.264 High + AAC 256k, 120 MB (under 512 MB), −14 LUFS.
- **Alt text for the video:** "Gameplay of Lowball: a noir fish auction where five AI buyers bid identical sealed envelopes.
  The player signs in with a Meteor NEAR wallet, questions a buyer by voice, signs a leniency offer in Meteor, and the
  first buyer to confess walks free while four bonds are slashed and paid to the player."

## Optional reply (thread, for builders)

```
How it works: the buyers are LLM agents on NEAR AI Cloud's TEE, every answer signed and checked. Leniency is a NEP-519 yield that closes itself after 200 blocks; the contract verifies each buyer's ed25519 pact signature before it slashes a bond.

github.com/CipherKuma/lowball
```

Why this shape: the reader's tension is "another AI demo", so the post leads with the game's one-line hook (you can't
outbid a cartel) and the concrete NEAR action judges can verify (leniency signed in your own wallet), then the play link;
the reply carries the technical proof for builders without crowding the main post.

Claims to confirm before posting: none beyond the film itself (every claim is in `demo/truth-ledger.md`).
