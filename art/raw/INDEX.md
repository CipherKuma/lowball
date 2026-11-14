# Raw asset index

Generated with the built-in image_gen tool only; no CLI fallback or API key.
Prompt set: `art/PROMPTS.md`, STYLE ANCHOR prepended to every call. Marlow calm supplied as style reference to every subsequent portrait; paired calm portraits also supplied for identity.
All outputs visually inspected for text, framing and palette. Green backgrounds are the requested palette exception.
26 requested assets; 28 images including two retained rejected first attempts. Final selection uses v2 for casefile and lantern.

| Key | Final file | Quality |
|---|---|---|
| bg_auction | [bg_auction.png](bg_auction.png) | Pass: five chairs, empty zinc slab and calm top space; no visible text. (1672×941) |
| marlow_calm | [marlow_calm.png](marlow_calm.png) | Pass: confident hooded expression, bowler, cane and scarred hand; master portrait reference. (1122×1402) |
| marlow_cracked | [marlow_cracked.png](marlow_cracked.png) | Pass: matching identity and clothes, furious wide eyes and forward posture. (1122×1402) |
| odile_calm | [odile_calm.png](odile_calm.png) | Pass: composed bob-haired buyer with glasses and blank ledger. (1122×1402) |
| odile_cracked | [odile_cracked.png](odile_cracked.png) | Pass: matching identity, glasses raised and restrained knowing half-smile. (1122×1402) |
| sully_calm | [sully_calm.png](sully_calm.png) | Pass: nervous forced grin, flat cap, oilskin and coin. (1122×1402) |
| sully_cracked | [sully_cracked.png](sully_cracked.png) | Pass: matching identity, open mouth, raised hands and visible panic. (1122×1402) |
| ines_calm | [ines_calm.png](ines_calm.png) | Pass: amused expression, wavy hair, fur collar and cigarette holder. (1122×1402) |
| ines_cracked | [ines_cracked.png](ines_cracked.png) | Pass: matching identity, delighted sideways glance and finger to lips. (1122×1402) |
| deacon_calm | [deacon_calm.png](deacon_calm.png) | Pass: gaunt face, clerical collar, folded hands and curling smoke. (1122×1402) |
| deacon_cracked | [deacon_cracked.png](deacon_cracked.png) | Pass: matching identity and clothes, cold stare and suspended smoke. (1122×1402) |
| bg_pier_title | [bg_pier_title.png](bg_pier_title.png) | Pass: dark left title space, boat, crate carrier and five distant silhouettes. (1672×941) |
| bg_casefile | [bg_casefile-v2.png](bg_casefile-v2.png) | Pass on v2: overhead desk, blank central folder; first version rejected for oblique angle. (1672×941) |
| keyart | [keyart.png](keyart.png) | Pass: five distinct buyers, foreground hand and pact, dark top-centre space. (1672×941) |
| prop_strongbox | [prop_strongbox.png](prop_strongbox.png) | Pass: open riveted iron box and unmarked coins on green. (1254×1254) |
| prop_pact | [prop_pact.png](prop_pact.png) | Pass: five abstract nonalphabetic ink flourishes and rust-red wax on green. (1254×1254) |
| prop_seal | [prop_seal.png](prop_seal.png) | Pass: plain fish relief in wax, no lettering, fully framed on green. (1254×1254) |
| prop_gavel | [prop_gavel.png](prop_gavel.png) | Pass: wooden gavel and block, fully framed on green; narrow side margins. (1254×1254) |
| prop_lantern | [prop_lantern-v2.png](prop_lantern-v2.png) | Pass on v2: complete lamp and short chain with green margins; first version touched top edge. (1254×1254) |
| prop_chain | [prop_chain.png](prop_chain.png) | Pass: heavy chain with visibly snapped link, fully framed on green. (1254×1254) |
| fish_cod | [fish_cod.png](fish_cod.png) | Pass: whole cod with barbel and three dorsal fins on ice and zinc. (1254×1254) |
| fish_halibut | [fish_halibut.png](fish_halibut.png) | Pass: broad flatfish with both eyes visible on upper side; narrow right margin. (1254×1254) |
| fish_monkfish | [fish_monkfish.png](fish_monkfish.png) | Pass: broad head, toothed mouth and tapering body on ice. (1254×1254) |
| fish_bluefin | [fish_bluefin.png](fish_bluefin.png) | Pass: tuna silhouette, finlets and crescent tail; narrow side margins. (1254×1254) |
| fish_seabass | [fish_seabass.png](fish_seabass.png) | Pass: silver scaled bass with spiny dorsal on ice and zinc. (1254×1254) |
| fish_lobster | [fish_lobster.png](fish_lobster.png) | Pass: two claws, segmented tail and fully framed antennae on ice. (1254×1254) |

## Retained first attempts

- `bg_casefile.png`: rejected oblique framing; use `bg_casefile-v2.png`.
- `prop_lantern.png`: chain touches top edge; use `prop_lantern-v2.png`.

## Verification limits

File existence and PNG headers/dimensions checked for all 26 final selections. Text, framing and palette checked visually, without automated OCR or strict pixel-palette validation. Requested aspect ratios were retained; native outputs are 1672×941 landscapes, 1122×1402 portraits and 1254×1254 squares, rather than exact requested pixel dimensions.
