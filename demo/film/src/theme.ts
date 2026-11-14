// The film speaks the game's type system (web/DESIGN.md, direction A "Under the lamp"):
// sign = poster capitals, display = what people say (old print serif, true italic), typed = documents, mono = data.
import {loadFont as shoulders} from '@remotion/google-fonts/BigShoulders';
import {loadFont as fell} from '@remotion/google-fonts/IMFellEnglish';
import {loadFont as franklin} from '@remotion/google-fonts/LibreFranklin';
import {loadFont as courier} from '@remotion/google-fonts/CourierPrime';
import {loadFont as elite} from '@remotion/google-fonts/SpecialElite';
shoulders('normal', {weights:['700','800','900'], subsets:['latin']});
fell('normal', {subsets:['latin']});
fell('italic', {subsets:['latin']});
franklin('normal', {weights:['400','500','600','700'], subsets:['latin']});
courier('normal', {weights:['400','700'], subsets:['latin']});
elite('normal', {subsets:['latin']});
export const font = {sign:'Big Shoulders', display:'IM Fell English', ui:'Libre Franklin', mono:'Courier Prime', typed:'Special Elite'};
export const c = {ink:'#0b1013', ink2:'#11181b', harbour:'#15302c', amber:'#f2b75c', hot:'#ffd08a', paper:'#ebe1c8', text:'#efe7d4', muted:'#a39c88', red:'#c43c31', ok:'#8fc2a0', paperInk:'#1f170e'};
/** Neon-tube lettering used by the LOWBALL sign on the landing page. */
export const neon = {color:'rgba(30,14,4,.55)', WebkitTextStroke:'4px #ffdcaa', textShadow:'0 0 2px #fff4dc, 0 0 9px rgba(255,194,102,.9), 0 0 26px rgba(242,150,50,.6), 0 0 64px rgba(242,140,40,.35)'};
