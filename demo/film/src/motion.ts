import {Easing, interpolate} from 'remotion';
export const clamp = {extrapolateLeft:'clamp',extrapolateRight:'clamp'} as const;
export const lerp = (f:number, from:number, to:number, a=0,b=1) => interpolate(f,[from,to],[a,b],clamp);
export const ease = (f:number, from:number,to:number,a=0,b=1) => interpolate(f,[from,to],[a,b],{...clamp,easing:Easing.inOut(Easing.cubic)});
export const reveal = (text:string,frame:number,start=0,rate=1.4) => text.slice(0,Math.max(0,Math.floor((frame-start)*rate)));
