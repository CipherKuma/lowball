# Lowball art prompts (Opus-authored). Output to art/raw/<key>.png (versioned -v2 etc. on retries).

STYLE ANCHOR (prepend to every prompt):
"Painted noir illustration, gouache and ink with visible brush texture and fine film grain,
1950s North-Atlantic fishing harbour at night. Palette strictly: teal-black shadows (#0b1418),
deep harbour green (#14302c), sodium-vapour amber light (#e8a33d), fog grey (#c8d1c9), one rust-red
accent (#8a2b22). Strong single-source lamplight, rim light, wet reflective surfaces, rain.
Cinematic, restrained, adult graphic-novel quality (think classic noir film stills painted by a
gouache illustrator). No text, no letters, no logos, no watermark."

## Backgrounds (16:9, 2560x1440 or largest 16:9 available)
- bg_auction: Interior of a cramped harbour fish-auction backroom at 4 a.m. A long zinc auction
  table in the middle ground, an empty slab at centre lit by one hanging sodium lamp, five empty
  wooden chairs behind the table in a shallow arc, rain streaking a tall warehouse window behind,
  fog outside with blurred boat masts and pier lights. Large calm negative space at the top third
  and on the slab for UI overlays. Moody, quiet, expectant.
- bg_pier_title: Wide shot of a wooden pier at night in heavy fog and rain, a single small fishing
  boat (white hull, name not legible) tied up, a lone figure in an oilskin coat seen from behind
  carrying a crate, five silhouettes waiting under a lit warehouse doorway in the distance. Leave
  the left 45% darker and emptier for a title.
- bg_casefile: Top-down view of a dark wooden desk under a green banker's lamp: a manila case
  folder, scattered carbon copies, a magnifying glass, a cooling cup of coffee, coins, a wax seal.
  Centre area of the folder blank and evenly lit for UI content.

## Buyer portraits (portrait 4:5, 1024x1280; chest-up, facing camera slightly off-axis, same lamp
from upper left, plain dark teal background with soft vignette so they cut out cleanly; same
painter across all five — generate marlow first, then pass it as style reference for the rest)
Each buyer: `<id>_calm` and `<id>_cracked` (same person, same framing, same clothes; cracked =
the expression and posture of someone who has just broken or been betrayed).
- marlow: man in his sixties, heavy build, weathered face, grey stubble, bowler hat, thick wool
  overcoat, scar across the knuckles of a hand resting on a cane. calm = slight confident smile,
  eyes hooded. cracked = jaw clenched, eyes wide with fury, leaning forward.
- odile: woman in her forties, sharp bob haircut, round wire glasses catching the lamp, high-collar
  dark blouse, holding a slim ledger to her chest. calm = composed, unreadable. cracked = glasses
  pushed up, cool tight-lipped half-smile of someone who just did the maths and switched sides.
- sully: young man in his twenties, flat cap, sweat on brow, oilskin jacket, nervous eyes darting
  sideways, fingers fidgeting with a coin. calm = forced grin. cracked = panicked, hands up,
  mouth open mid-word, sweat dripping.
- ines: woman in her thirties, glamorous, dark wavy hair, red lipstick (the rust-red accent), fur
  collar coat, cigarette holder. calm = amused, warm, flirtatious. cracked = sly sideways glance,
  finger to lips, delighted by her own betrayal.
- deacon: gaunt man in his fifties, clerical collar under a black coat, deep-set eyes, cigarette
  smoke curling, hands folded. calm = serene, menacing stillness. cracked = cold, venomous stare,
  smoke frozen mid-air.

## Props (square 1024x1024, isolated on flat pure #00ff00 chroma green background for keying,
same painted style and lamp direction, no cast shadow onto background)
- prop_strongbox: small riveted iron strongbox, lid ajar, NEAR-coin-like silver coins inside
  (coins plain, no symbols).
- prop_pact: a folded sheet of aged paper with five ink signatures (illegible scrawls) and a
  blot of red wax, slightly crumpled.
- prop_seal: a rust-red wax seal stamp impression, close-up, plain fish emblem.
- prop_gavel: an auctioneer's wooden gavel resting on its block.
- prop_lantern: hanging sodium lamp with metal shade, glowing amber.
- prop_chain: a short length of heavy iron chain, snapped link.
## Fish lots (square 1024x1024, chroma green background, on a bed of crushed ice on a zinc slab
section, painted): fish_cod, fish_halibut, fish_monkfish, fish_bluefin, fish_seabass, fish_lobster.

## Key art (16:9 2560x1440): keyart
The five buyers lit by one lamp around the auction table, faces half in shadow, all looking
toward the viewer; in the foreground, out of focus, the player's weathered hand slides a folded
paper (the pact) across the zinc table. Tension, conspiracy. Space top-centre for a title.
