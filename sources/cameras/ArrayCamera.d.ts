//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// WARNING: This file was auto-generated, any change will be overridden in next release. Please use configs/es6.conf.js then run "npm run convert". //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
import { PerspectiveCamera } from './PerspectiveCamera';

export class ArrayCamera extends PerspectiveCamera {
  constructor(cameras?: PerspectiveCamera[]);

  cameras: PerspectiveCamera[];
  isArrayCamera: true;
}
