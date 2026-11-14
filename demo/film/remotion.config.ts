import {Config} from '@remotion/cli/config';
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setConcurrency(2);
Config.overrideWebpackConfig(config => ({...config,watchOptions:{...config.watchOptions,poll:1000,ignored:['**/node_modules/**','**/.cache/**','**/review/**']}}));
