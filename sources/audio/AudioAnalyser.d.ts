//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// WARNING: This file was auto-generated, any change will be overridden in next release. Please use configs/es6.conf.js then run "npm run convert". //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
export class AudioAnalyser {
  constructor(audio: any, fftSize: number);

  analyser: any;
  data: Uint8Array;

  getFrequencyData(): Uint8Array;
  getAverageFrequency(): number;
  getData(file: any): any;
}