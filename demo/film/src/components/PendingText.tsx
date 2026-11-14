import {c} from '../theme';
// Preserve typing while making even a partly revealed TODO visibly provisional.
export const PendingText=({text,dark=false}:{text:string;dark?:boolean})=><>{text.split(/(TODO[^\n]*|PENDING[^\n]*|pending[^\n]*)/g).map((part,i)=>/^(TODO|PENDING|pending)/.test(part)?<span key={i} style={{color:dark?c.hot:'#81500b',textDecorationLine:'underline',textDecorationStyle:'dashed',textDecorationColor:c.amber,textUnderlineOffset:6,textDecorationThickness:2}}>{part}</span>:part)}</>;
