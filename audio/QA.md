# VO QA (STT round-trip, ElevenLabs scribe_v3 with keyterms, run on the shipped normalised mp3s)

Generation: eleven_v4, 2 takes per line, the better take kept (take score = difflib similarity of the scribe_v3 transcript vs the script, minus a penalty for runaway duration and for a spoken tag word). Similarity = difflib ratio on lowercased, punctuation-stripped text with US/UK spelling and dialect folded (civilized/civilised, harbor/harbour, favor/favour, around/round, Cap'n/captain, morning/mornin). Regeneration threshold: < 0.90.

| key | tag | take (sim t1 / t2) | final similarity | script | heard (shipped file) |
|---|---|---|---|---|---|
| intro_1 | [dry radio dispatcher, low and tired] | 1 (0.983 / 0.983) | 0.983 | Pier Nine. Four a.m. The fog's in, the boats are back, and the buyers are already waiting. | Pier Nine, 4:00 a.m. The fog's in, the boats are back, and the buyers are already waiting. |
| intro_2 | [dry radio dispatcher, low and tired] | 1 (1.0 / 1.0) | 1.0 | Five of them. Same five every morning. Funny how they never seem to disagree. | Five of them, same five every morning. Funny how they never seem to disagree. |
| day_open | [dry radio dispatcher] | 1 (1.0 / 1.0) | 1.0 | Fresh lot on the board. | Fresh lot on the board. |
| identical | [dry radio dispatcher, flat] | 1 (1.0 / 1.0) | 1.0 | Same number. All five. Again. | Same number, all five, again. |
| leniency | [dry radio dispatcher, lowering his voice] | 2 (0.736 / 1.0) | 1.0 | Word goes round the pier. First one to talk walks free. | Word goes round the pier. First one to talk walks free. |
| confessed | [dry radio dispatcher, quiet] | 1 (1.0 / 1.0) | 1.0 | Somebody talked. | Somebody talked. |
| holdout | [dry radio dispatcher, flat] | 1 (1.0 / 1.0) | 1.0 | Nobody talked. Not today. | Nobody talked, not today. |
| season_end_win | [dry radio dispatcher, quietly relieved] | 1 (1.0 / 1.0) | 1.0 | The ring's broken. For now. | The ring's broken, for now. |
| season_end_lose | [dry radio dispatcher, weary] | 1 (1.0 / 1.0) | 1.0 | They kept their mouths shut. And you kept getting robbed. | They kept their mouths shut, and you kept getting robbed. |
| marlow_greet | [gravelly, slow, menacing] | 1 (1.0 / 1.0) | 1.0 | Morning, captain. Let's keep this civilised. | Morning, Captain. Let's keep this civilized. |
| marlow_bid | [gravelly, menacing] | 1 (1.0 / 1.0) | 1.0 | That's what it's worth. To us. | That's what it's worth to us. |
| marlow_threat | [gravelly, menacing, low voice] | 1 (1.0 / 1.0) | 1.0 | Nobody on this pier talks. Nobody. | Nobody on this pier talks. Nobody. |
| marlow_betrayed | [gravelly, furious, low voice] | 1 (1.0 / 1.0) | 1.0 | You rat. After everything I did for this harbour. | You rat. After everything I did for this harbor. |
| odile_greet | [cold, precise] | 1 (1.0 / 1.0) | 1.0 | Your catch. Our price. Shall we. | Your catch, our price. Shall we? |
| odile_bid | [cold, precise] | 1 (1.0 / 1.0) | 1.0 | The arithmetic is not in your favour. | The arithmetic is not in your favor. |
| odile_confess | [cold, precise] | 1 (1.0 / 1.0) | 1.0 | The numbers changed. I simply followed them. | The numbers changed. I simply followed them. |
| odile_betrayed | [cold, precise, clipped] | 1 (1.0 / 1.0) | 1.0 | An inefficient outcome. For me. | An inefficient outcome for me. |
| sully_greet | [nervous] | 1 (0.974 / 0.974) | 0.974 | Mornin'. Look — it's nothin' personal, yeah? | Morning. Look, it's nothing personal, yeah? |
| sully_bid | [nervous, breathless] | 1 (1.0 / 1.0) | 1.0 | Same as them. I — same as them. | Same as them. I... Same as them. |
| sully_confess | [breathless, panicked] | 1 (1.0 / 1.0) | 1.0 | Okay. Okay! I'll tell you everything. Just keep my name clean. | Okay, okay. I'll tell you everything. Just keep my name clean. |
| sully_betrayed | [breathless, panicked] | 1 (1.0 / 1.0) | 1.0 | No, no, no — that was my money! | No, no, no. That was my money. |
| ines_greet | [warm, amused] | 1 (1.0 / 1.0) | 1.0 | Darling, you look exhausted. Sell to me and go to bed. | Darling, you look exhausted. Sell to me and go to bed. |
| ines_bid | [warm, amused] | 1 (1.0 / 1.0) | 1.0 | It's a generous offer. Considering. | It's a generous offer, considering. |
| ines_confess | [amused, low voice] | 1 (1.0 / 1.0) | 1.0 | Loyalty is lovely. Immunity is lovelier. | Loyalty is lovely. Immunity is lovelier. |
| ines_betrayed | [amused, purring] | 1 (1.0 / 1.0) | 1.0 | Oh, you clever little thing. | Oh, you clever little thing. |
| deacon_greet | [whispering] | 1 (1.0 / 1.0) | 1.0 | Peace be with you. | Peace be with you. |
| deacon_bid | [low voice] | 1 (1.0 / 1.0) | 1.0 | As agreed. | As agreed. |
| deacon_hold | [low voice, whispering] | 1 (1.0 / 1.0) | 1.0 | I have nothing to say to you. | I have nothing to say to you. |
| deacon_betrayed | [whispering, low voice] | 1 (1.0 / 1.0) | 1.0 | Judas. | Judas. |

Lines: 29; min similarity 0.974; below 0.90: 0. Non-1.0 lines are spelling or numeral normalisation by the transcriber (4:00 a.m. for Four a.m.; Morning for Mornin') or an accent rendering, not wrong words. leniency take 1 ran on and repeated the line (0.736); take 2 shipped.

## Film narration (demo/vo, eleven_v4, voice Chris, no tags)

| id | take | similarity | seconds | LUFS | true peak dBFS | heard |
|---|---|---|---|---|---|---|
| e01 | 1 | 1.0 | 13.28 | -16.2 | -2.2 | In game economies, players get stuck selling low to buyers who quietly agree on a price. Now those buyers can be AI agents, and research shows you can't catch AI agents colluding just by reading their reasoning. |
| e02 | 1 | 1.0 | 6.72 | -16.1 | -2.1 | So we built Lowball, an auction game on NEAR where you don't out-haggle the cartel, you break it. |
| e03 | 2 | 0.99 | 12.32 | -16.1 | -2.1 | Every morning, you land a catch and five AI buyers bid on it. Before the season, they agree to price in private. Each one signed that pact with their own key, and each put a bond into our NEAR contract. |
| e04 | 1 | 1.0 | 7.52 | -16.2 | -2.2 | Their sealed bids come back identical. So you take the low price for a couple of days, and every identical day goes on the record. |
| e05 | 1 | 0.952 | 9.44 | -16.1 | -2.2 | Now you have a case, so you offer leniency. You sign it from your browser, and the contract opens a window that closes by itself after 200 blocks. |
| e06 | 1 | 1.0 | 12.24 | -16.2 | -1.6 | The first buyer to hand over the signed pact gets immunity. The contract checks every signature, slashes the other bonds, and pays them to you. And when a second buyer tries, the contract refuses. |
| e07 | 1 | 1.0 | 7.84 | -16.2 | -2.3 | Every buyer runs on NEAR AI Cloud inside a TEE, and we verify each response's signature against the attested hardware. |
| e07b | 1 | 1.0 | 7.04 | -16.2 | -2.1 | Their signing keys live inside an OutLayer enclave, so not even our own server can forge a pact or a confession. |
| e08 | 1 | 1.0 | 7.84 | -16.1 | -2.2 | Each catch is a NEP-245 token, and with chain signatures, the slashed bonds can even pay you out on Ethereum. |
| e09 | 1 | 0.946 | 10.48 | -16.1 | -2.1 | In 14 simulated seasons, the ring held identical bids almost every day without leniency. With it, a buyer cracked in nine seasons out of 10. |
| e10 | 1 | 1.0 | 2.56 | -16.2 | -2.3 | That's Lowball. Make one of them talk. |

Narration lines below 1.0 differ only by numerals written as digits (200 blocks, 14 seasons, 10) and one agree/agreed variant in e03; segment text in narration.json is unchanged.
