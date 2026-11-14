# VO QA (STT round-trip, ElevenLabs scribe_v1, run on the final normalised mp3s)

Similarity = difflib ratio on lowercased, punctuation-stripped text. Threshold for regeneration: < 0.90. Result: no line below threshold, no regeneration needed. Differences are STT spelling normalisation (US spelling: civilized/harbor/favor; `round`->`around`) or accent rendering (`captain`->`Cap'n`, `Mornin'`->`Morning`), not wrong words.

| key | similarity | script | heard |
|---|---|---|---|
| intro_1 | 0.994 | Pier Nine. Four a.m. The fog's in, the boats are back, and the buyers are already waiting. | Pier nine, four AM. The fog's in, the boats are back, and the buyers are already waiting |
| intro_2 | 1.0 | Five of them. Same five every morning. Funny how they never seem to disagree. | Five of them. Same five every morning. Funny how they never seem to disagree |
| day_open | 1.0 | Fresh lot on the board. | Fresh lot on the board |
| identical | 1.0 | Same number. All five. Again. | Same number, all five, again |
| leniency | 0.991 | Word goes round the pier. First one to talk walks free. | Word goes around the pier, first one to talk walks free |
| confessed | 1.0 | Somebody talked. | Somebody talked |
| holdout | 1.0 | Nobody talked. Not today. | Nobody talked. Not today |
| season_end_win | 1.0 | The ring's broken. For now. | The ring's broken for now |
| season_end_lose | 1.0 | They kept their mouths shut. And you kept getting robbed. | They kept their mouths shut and you kept getting robbed |
| marlow_greet | 0.925 | Morning, captain. Let's keep this civilised. | Morning, Cap'n. Let's keep this civilized |
| marlow_bid | 1.0 | That's what it's worth. To us. | That's what it's worth to us |
| marlow_threat | 1.0 | Nobody on this pier talks. Nobody. | Nobody on this pier talks. Nobody |
| marlow_betrayed | 0.989 | You rat. After everything I did for this harbour. | You rat. After everything I did for this harbor |
| odile_greet | 1.0 | Your catch. Our price. Shall we. | Your catch, our price. Shall we? |
| odile_bid | 0.986 | The arithmetic is not in your favour. | The arithmetic is not in your favor |
| odile_confess | 1.0 | The numbers changed. I simply followed them. | The numbers changed. I simply followed them |
| odile_betrayed | 1.0 | An inefficient outcome. For me. | An inefficient outcome for me |
| sully_greet | 0.949 | Mornin'. Look — it's nothin' personal, yeah? | Morning. Look, it's nothing personal, yeah? |
| sully_bid | 1.0 | Same as them. I — same as them. | Same as them. I, same as them |
| sully_confess | 1.0 | Okay. Okay! I'll tell you everything. Just keep my name clean. | Okay. Okay. I'll tell you everything. Just keep my name clean |
| sully_betrayed | 1.0 | No, no, no — that was my money! | No, no, no, that was my money |
| ines_greet | 1.0 | Darling, you look exhausted. Sell to me and go to bed. | Darling, you look exhausted. Sell to me and go to bed |
| ines_bid | 1.0 | It's a generous offer. Considering. | It's a generous offer, considering |
| ines_confess | 1.0 | Loyalty is lovely. Immunity is lovelier. | Loyalty is lovely. Immunity is lovelier |
| ines_betrayed | 1.0 | Oh, you clever little thing. | Oh, you clever little thing |
| deacon_greet | 1.0 | Peace be with you. | Peace be with you |
| deacon_bid | 1.0 | As agreed. | As agreed |
| deacon_hold | 1.0 | I have nothing to say to you. | I have nothing to say to you |
| deacon_betrayed | 1.0 | Judas. | Judas |

Lines: 29; min similarity 0.925; below 0.90: 0.
