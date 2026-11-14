import {loadVariableFont as fraunces} from '@remotion/google-fonts/Fraunces';
import {loadFont as inter} from '@remotion/google-fonts/InterTight';
import {loadFont as plex} from '@remotion/google-fonts/IBMPlexMono';
fraunces('normal', {subsets:['latin']});
fraunces('italic', {subsets:['latin']});
inter('normal', {weights:['400','600','700'], subsets:['latin']});
plex('normal', {weights:['400','500'], subsets:['latin']});
export const font = {display:'Fraunces', ui:'Inter Tight', mono:'IBM Plex Mono'};
export const c = {ink:'#0b1418', ink2:'#0f1d21', harbour:'#14302c', amber:'#e8a33d', hot:'#ffc266', paper:'#e6dcc4', text:'#ece6d6', muted:'#8d9a93', red:'#b8392c', ok:'#7fb59a', paperInk:'#2a2116'};
