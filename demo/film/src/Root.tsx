import {Composition} from 'remotion';
import {Lowball} from './Lowball';
export const Root=()=> <Composition id="Lowball" component={Lowball} width={1920} height={1080} fps={30} durationInFrames={4050} defaultProps={{showGuide:true,audio:true}}/>;
