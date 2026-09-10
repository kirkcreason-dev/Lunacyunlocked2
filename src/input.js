import {emptyInput} from './engine.js';
export const KEYMAPS=[{KeyA:'left',KeyD:'right',KeyW:'jump',KeyS:'block',KeyJ:'light',KeyK:'heavy',KeyL:'grapple',KeyU:'special'},{ArrowLeft:'left',ArrowRight:'right',ArrowUp:'jump',ArrowDown:'block',Digit1:'light',Digit2:'heavy',Digit3:'grapple',Digit0:'special',Numpad1:'light',Numpad2:'heavy',Numpad3:'grapple',Numpad0:'special'}];
const actions=new Set(['jump','light','heavy','grapple','special']);
const pauseKeys=new Set(['Escape','KeyP']);

// Device state is independent of the DOM so short taps and controller assignment are testable.
export class InputState {
  constructor(onPause=()=>{}){
    this.keys=new Set();this.touch=emptyInput();this.pending=[new Set(),new Set()];
    this.active=false;this.onPause=onPause;this.pointers=new Map();this.scheme='keyboard';
    this.padSlots=[null,null];this.padPrevious=[{},{}];this.padPause=[false,false];
  }
  pressKey(code){
    if(!this.keys.has(code))for(let i=0;i<2;i++){const action=KEYMAPS[i][code];if(actions.has(action))this.pending[i].add(action);}
    this.keys.add(code);if(KEYMAPS[0][code])this.scheme='keyboard';
  }
  releaseKey(code){this.keys.delete(code);}
  pressTouch(pointer,key){this.pointers.set(pointer,key);if(actions.has(key))this.pending[0].add(key);this.scheme='touch';this.syncTouch();}
  releaseTouch(pointer){this.pointers.delete(pointer);this.syncTouch();}
  syncTouch(){this.touch=emptyInput();for(const key of this.pointers.values())this.touch[key]=true;}
  clear(){this.keys.clear();this.pointers.clear();this.touch=emptyInput();this.pending.forEach(set=>set.clear());}
  read(pads=[]){
    const result=KEYMAPS.map((map,i)=>{const input=emptyInput();for(const code of this.keys)if(map[code])input[map[code]]=true;input.pressed=Object.fromEntries([...this.pending[i]].map(key=>[key,true]));this.pending[i].clear();return input;});
    for(const k in this.touch)result[0][k] ||= this.touch[k];
    const connected=Array.from(pads).filter(p=>p&&p.connected!==false);
    // Retain player slots when a pad disappears; filtering the pad list must never move P2 to P1.
    this.padSlots.forEach((id,i)=>{if(id!==null&&!connected.some(p=>p.index===id)){this.padSlots[i]=null;this.padPrevious[i]={};this.padPause[i]=false;if(this.active)this.onPause(true);}});
    for(const pad of connected)if(!this.padSlots.includes(pad.index)){const vacant=this.padSlots.indexOf(null);if(vacant>=0)this.padSlots[vacant]=pad.index;}
    this.padSlots.forEach((id,i)=>{
      const pad=connected.find(p=>p.index===id);if(!pad)return;
      const b=n=>Boolean(pad.buttons[n]?.pressed),value={
        left:pad.axes[0]<-.35||b(14),right:pad.axes[0]>.35||b(15),jump:b(0)||b(12),
        light:b(2),heavy:b(3),grapple:b(1),block:b(4)||b(13),special:b(5),
      };
      for(const key of Object.keys(value)){result[i][key] ||= value[key];if(actions.has(key)&&value[key]&&!this.padPrevious[i][key])result[i].pressed[key]=true;}
      this.padPrevious[i]=value;
      if(i===0&&Object.values(value).some(Boolean))this.scheme='gamepad';
      const start=b(9);if(start&&!this.padPause[i]&&this.active)this.onPause();this.padPause[i]=start;
    });
    return result;
  }
}
export class Input extends InputState {
  constructor(onPause){
    super(onPause);
    addEventListener('keydown',e=>{
      if(e.target instanceof HTMLSelectElement||e.target instanceof HTMLInputElement||e.target?.isContentEditable)return;
      if(this.active&&(KEYMAPS.some(m=>m[e.code])||pauseKeys.has(e.code)||e.code==='Space'))e.preventDefault();
      if(this.active&&!e.repeat&&pauseKeys.has(e.code)){onPause();return;}
      this.pressKey(e.code);
    });
    addEventListener('keyup',e=>this.releaseKey(e.code));
    addEventListener('blur',()=>{this.clear();if(this.active)this.onPause(true);});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){this.clear();if(this.active)this.onPause(true);}});
    for(const button of document.querySelectorAll('[data-key]')){
      button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);this.pressTouch(e.pointerId,button.dataset.key);button.classList.add('pressed');});
      for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,e=>{this.releaseTouch(e.pointerId);button.classList.toggle('pressed',[...this.pointers.values()].includes(button.dataset.key));});
      button.addEventListener('contextmenu',e=>e.preventDefault());
    }
  }
  clear(){super.clear();document.querySelectorAll('[data-key].pressed').forEach(button=>button.classList.remove('pressed'));}
  read(){return super.read(navigator.getGamepads?.()||[]);}
}
