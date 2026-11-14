// Film seconds. Gameplay cue times come from take 2's event log mapped through each select's source range
// (demo/footage/takes.md); only sounds the game itself plays for those events are used (web/src/lib/useGame.ts).
export const scenes = [
 {id:'cold-open',from:0,to:7}, {id:'world-title',from:7,to:15},
 {id:'problem',from:15,to:26}, {id:'before-dawn',from:26,to:36},
 {id:'day-one-lot',from:36,to:47}, {id:'identical-bids',from:47,to:55},
 {id:'interrogation',from:55,to:77}, {id:'leniency',from:77,to:103},
 {id:'case-file',from:103,to:116}, {id:'proof',from:116,to:124.5},
 {id:'ledger',from:124.5,to:130.5}, {id:'lockup',from:130.5,to:135},
];
export const soundCues = [
 // cold open: day-1 reveal (a 42.2 s) and gavel
 {at:2.7,file:'card_flip',volume:.45}, {at:3.0,file:'gavel',volume:.32},
 {at:7,file:'foghorn',volume:.18},
 {at:12,file:'paper_slide',volume:.22}, {at:15,file:'folder_open',volume:.28},
 {at:18.2,file:'ui_tick',volume:.18}, {at:21.7,file:'paper_slide',volume:.24},
 // before dawn (a 4–26 s at 2.2×): day 1 opens at a 25.8 s
 {at:35.9,file:'auction_bell',volume:.32},
 // day-one lot (a 26–37 s): five sealed commits at a 36.7–37.5 s
 {at:46.7,file:'paper_slide',volume:.28},
 // identical bids (a 41–49 s): reveal a 42.2 s, settle a 42.5 s
 {at:48.2,file:'card_flip',volume:.45}, {at:48.5,file:'gavel',volume:.36},
 // leniency select: day-2 commits a 88.7 s, reveal a 93.6 s (2× → film 77 + (t − 85)/2)
 {at:78.9,file:'paper_slide',volume:.22}, {at:81.3,file:'card_flip',volume:.4}, {at:81.45,file:'gavel',volume:.3},
 // then b 1–21 s (film = 82 + b): Deacon refused + Sully confessed land together (b 11.6), Odile refused (b 13.9), slash (b 14.1)
 {at:93.6,file:'refusal_thud',volume:.42}, {at:93.7,file:'wax_seal',volume:.4},
 {at:96.0,file:'refusal_thud',volume:.4}, {at:96.2,file:'bond_slash',volume:.36}, {at:97.3,file:'coins_pour',volume:.3},
 // case file: open, re-check, back room, forgery refusals (c 84.6 / 85.0 / 85.4 s)
 {at:103.2,file:'folder_open',volume:.3}, {at:105.6,file:'ui_tick',volume:.2}, {at:108.6,file:'paper_slide',volume:.24},
 {at:113.7,file:'refusal_thud',volume:.36}, {at:114.1,file:'refusal_thud',volume:.33}, {at:114.5,file:'refusal_thud',volume:.3},
 {at:116.2,file:'folder_open',volume:.26}, {at:124.6,file:'paper_slide',volume:.3},
 {at:131.77,file:'wax_seal',volume:.25}, {at:132.2,file:'wax_seal',volume:.19}, {at:132.63,file:'wax_seal',volume:.15},
];
export const keyFrames=[0,90,240,330,450,600,780,900,1080,1250,1410,1450,1650,1810,2140,2310,2450,2690,2810,2900,3010,3090,3200,3300,3420,3480,3600,3735,3850,3915,4030];
