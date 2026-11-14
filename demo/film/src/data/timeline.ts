// Film seconds. Gameplay cue times come from take 10's beat log (demo/footage/take-10.log) mapped through each select's source range
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
 // cold open (b 93.4–100.4): day-2 envelopes slit at b 94.8, lot settles b 96
 {at:1.4,file:'card_flip',volume:.45}, {at:2.6,file:'gavel',volume:.32},
 {at:7,file:'foghorn',volume:.18},
 {at:12,file:'paper_slide',volume:.22}, {at:15,file:'folder_open',volume:.28},
 {at:18.2,file:'ui_tick',volume:.18}, {at:21.7,file:'paper_slide',volume:.24},
 // before dawn: Connect (a 13.5 → 26.4), Meteor signs (m1 4.0 → 30.2), day 1 opens (b 22.1 at 3.4× → 35.8)
 {at:26.4,file:'ui_tick',volume:.22}, {at:30.2,file:'wax_seal',volume:.24}, {at:35.8,file:'auction_bell',volume:.32},
 // day-one lot (b 22.6–33.6): sell at b 27.5, five sealed commits by b 30
 {at:40.9,file:'ui_tick',volume:.2}, {at:43.4,file:'paper_slide',volume:.28},
 // identical bids (b 33.9–41.9): reveal b 37.8, settle b 40.4
 {at:50.9,file:'card_flip',volume:.45}, {at:53.5,file:'gavel',volume:.36},
 // leniency: day 2 at 2.5× (sell b 84.5, reveal b 94.8, settle b 96), offer click b 103.2 → 85.0, Meteor approve → 89.2,
 // then c from 3.3 (film 91.6): Sully's confession, Ines and Odile refused, the slash, verdict at c 7.3 → 95.6
 {at:77.2,file:'paper_slide',volume:.22}, {at:81.3,file:'card_flip',volume:.4}, {at:81.8,file:'gavel',volume:.3},
 {at:85.0,file:'ui_tick',volume:.22}, {at:89.2,file:'ui_tick',volume:.2},
 {at:94.9,file:'wax_seal',volume:.4}, {at:95.2,file:'refusal_thud',volume:.42}, {at:95.5,file:'refusal_thud',volume:.38},
 {at:95.8,file:'bond_slash',volume:.36}, {at:96.8,file:'coins_pour',volume:.3},
 // case file: open (c 18.3 → 103.2), re-check stamps (→ 106.4), wiretap deck, forgery refusals (→ 114.9–115.5)
 {at:103.2,file:'folder_open',volume:.3}, {at:106.0,file:'ui_tick',volume:.2},
 {at:114.6,file:'refusal_thud',volume:.36}, {at:114.9,file:'refusal_thud',volume:.33}, {at:115.2,file:'refusal_thud',volume:.3},
 {at:116.2,file:'folder_open',volume:.26}, {at:124.6,file:'paper_slide',volume:.3},
 {at:131.77,file:'wax_seal',volume:.25}, {at:132.2,file:'wax_seal',volume:.19}, {at:132.63,file:'wax_seal',volume:.15},
];
export const keyFrames=[0,90,240,330,450,600,780,900,1080,1250,1410,1450,1650,1810,2140,2310,2450,2690,2810,2900,3010,3090,3200,3300,3420,3480,3600,3735,3850,3915,4030];
