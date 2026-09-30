import { readFileSync, writeFileSync } from 'node:fs';

// The downloaded game has no source files. Patch its bundled defaults in the
// build output, leaving the original asset in the repository intact.
const path = new URL('../dist/car-soccer/assets/main-Ds67--rX.js', import.meta.url);
let game = readFileSync(path, 'utf8');

function replaceOnce(before, after) {
  const first = game.indexOf(before);
  if (first < 0 || game.indexOf(before, first + before.length) >= 0) {
    throw new Error('Car Soccer bundle changed; control defaults need review.');
  }
  game = game.slice(0, first) + after + game.slice(first + before.length);
}

replaceOnce(
  'boost:[{kind:"mouse",button:0}],jump:[{kind:"mouse",button:2}],powerslide:[{kind:"key",code:"ShiftLeft"},{kind:"key",code:"ShiftRight"}],airRoll:[{kind:"key",code:"ShiftLeft"},{kind:"key",code:"ShiftRight"}],airRollLeft:[{kind:"key",code:"KeyQ"}],airRollRight:[{kind:"key",code:"KeyE"}],ballCam:[{kind:"key",code:"Space"}]',
  'boost:[{kind:"key",code:"ShiftLeft"}],jump:[{kind:"key",code:"Space"}],powerslide:[{kind:"key",code:"ShiftLeft"}],airRoll:[{kind:"key",code:"ShiftRight"}],airRollLeft:[{kind:"key",code:"KeyQ"}],airRollRight:[{kind:"key",code:"KeyE"}],ballCam:[{kind:"key",code:"KeyC"}]',
);
replaceOnce(
  'toggleSettings:[{kind:"key",code:"Escape"}],saveClip:[{kind:"key",code:"KeyC"}]}}function Hc()',
  'toggleSettings:[{kind:"key",code:"Escape"}],saveClip:[]}}function Hc()',
);
replaceOnce(
  'toggleSettings:[{kind:"padButton",index:9}],saveClip:[{kind:"padButton",index:10}]}}function Rc()',
  'toggleSettings:[{kind:"padButton",index:9}],saveClip:[]}}function Rc()',
);
replaceOnce(
  'function Ju(){return Nc.load()}function Xu(n){Nc.save(n)}',
  'function Ju(){const n=Nc.load(),t=Ic(),e={boost:[{kind:"mouse",button:0}],jump:[{kind:"mouse",button:2}],powerslide:[{kind:"key",code:"ShiftLeft"},{kind:"key",code:"ShiftRight"}],airRoll:[{kind:"key",code:"ShiftLeft"},{kind:"key",code:"ShiftRight"}],ballCam:[{kind:"key",code:"Space"}],saveClip:[{kind:"key",code:"KeyC"}]};let r=!1;for(const [i,o]of Object.entries(e))JSON.stringify(n.keyboard[i])===JSON.stringify(o)&&(n.keyboard[i]=t[i],r=!0);JSON.stringify(n.pad.saveClip)===JSON.stringify([{kind:"padButton",index:10}])&&(n.pad.saveClip=[],r=!0);return r&&Nc.save(n),n}function Xu(n){Nc.save(n)}',
);

writeFileSync(path, game);
