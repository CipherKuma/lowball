import {spring,useCurrentFrame} from 'remotion';
import {c,font} from '../theme';
import {ease} from '../motion';
export const Stamp = ({text,at=0,verified=false,small=false}:{text:string;at?:number;verified?:boolean;small?:boolean}) => {
 const f=useCurrentFrame();const p=spring({frame:f-at,fps:30,config:{damping:11,stiffness:210,mass:.65}});
 return <div style={{fontFamily:font.typed,fontWeight:400,fontSize:small?21:35,letterSpacing:'.13em',textTransform:'uppercase',border:'3px solid currentColor',borderRadius:4,padding:'10px 16px',color:verified?c.hot:c.red,background:'#0a08060d',whiteSpace:'nowrap',opacity:ease(f,at,at+4),transformOrigin:'right bottom',transform:`rotate(-7deg) scale(${1.25-p*.25})`,boxShadow:'inset 0 0 0 3px #00000008'}}>{text}</div>;
};
