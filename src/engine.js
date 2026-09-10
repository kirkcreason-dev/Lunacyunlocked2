// Pure fixed-step match simulation. Rendering and input devices never change the rules.
export const STEP = 1 / 60;
export const FLOOR = 593;
export const LEFT = 200;
export const RIGHT = 1080;
export const INPUT_BUFFER = .16;
export const THROW_BREAK_WINDOW = .22;
export const MOVES = Object.freeze({
  light: {startup:.10, active:.11, recovery:.22, reach:113, damage:6, stun:.24, knock:20, meter:7},
  heavy: {startup:.29, active:.16, recovery:.42, reach:149, damage:13, stun:.44, knock:52, meter:12},
  special: {startup:.19, active:.18, recovery:.65, reach:157, damage:31, stun:.75, knock:130, meter:0},
});
export const emptyInput = () => ({left:false,right:false,jump:false,block:false,light:false,heavy:false,grapple:false,special:false});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const tap=(input,last,key)=>Boolean(input.pressed?.[key] || (input[key]&&!last[key]));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const unavailable=f=>['down','rise','grabbed','lifted','thrown','pinned','pin'].includes(f.state);
export class Match {
  constructor(roster,p1=0,p2=1,options={}) {
    this.roster=roster;this.ids=[p1,p2];this.options={difficulty:'normal',mode:'cpu',...options};
    this.random=options.random||Math.random;this.round=1;this.wins=[0,0];this.events=[];this.winner=null;
    this.newRound();
  }
  newRound(){
    this.fighters=this.ids.map((id,i)=>({id,definition:this.roster[id],x:i?870:410,z:0,vz:0,vx:0,facing:i?-1:1,hp:100,meter:0,guard:100,state:'idle',t:0,move:null,hit:false,stun:0,invincible:0,downTime:0,combo:0,comboTime:0,buffer:null,last:emptyInput()}));
    this.phase='intro';this.phaseTime=0;this.remaining=99;this.grapple=null;this.pin=null;this.hitStop=0;this.shake=0;this.totalTime=0;this.aiTimer=0;this.aiInput=emptyInput();this.roundWinner=null;this.method='';
    this.emit('round',{round:this.round});
  }
  emit(type,detail={}){this.events.push({type,...detail});}
  drainEvents(){return this.events.splice(0);}
  step(inputs=[emptyInput(),emptyInput()],dt=STEP){
    if(this.phase==='done')return;
    dt=clamp(dt,0,.05);this.totalTime+=dt;this.shake=Math.max(0,this.shake-dt*35);
    this.phaseTime+=dt;
    if(this.phase==='intro'){
      if(this.phaseTime>=2.4){this.phase='fight';this.phaseTime=0;this.emit('fight');}
      this.remember(inputs);
      return;
    }
    if(this.phase==='roundEnd'){
      for(const f of this.fighters)f.t+=dt;
      if(this.phaseTime>3){
        if(this.wins.some(n=>n>=2)){this.phase='done';this.winner=this.wins[0]>=2?0:1;this.emit('matchEnd',{winner:this.winner,method:this.method});}
        else{this.round++;this.newRound();}
      }return;
    }
    if(this.options.mode!=='local') inputs=[inputs[0],this.hitStop>0?this.aiInput:this.cpu(dt)];
    // Capture short presses even during hit-stop; consume one command only when it becomes legal.
    this.fighters.forEach((f,i)=>this.bufferInput(f,inputs[i]||emptyInput(),this.hitStop>0?0:dt));
    if(this.hitStop>0){this.hitStop-=dt;this.remember(inputs);return;}
    this.remaining=Math.max(0,this.remaining-dt);
    if(this.remaining<=0&&!this.grapple&&!this.pin){this.timeLimit();return;}
    for(const f of this.fighters){f.t+=dt;f.invincible=Math.max(0,f.invincible-dt);f.comboTime=Math.max(0,f.comboTime-dt);if(!f.comboTime)f.combo=0;}
    if(this.grapple){this.updateGrapple(dt);this.remember(inputs);if(!this.grapple&&this.remaining<=0)this.timeLimit();return;}
    if(this.pin){this.updatePin(inputs,dt);this.remember(inputs);if(!this.pin&&this.remaining<=0)this.timeLimit();return;}
    // Resolve both players' intentions before evaluating attack ranges.
    for(let i=0;i<2;i++){this.updateFighter(this.fighters[i],this.fighters[1-i],inputs[i]||emptyInput(),dt,i);if(this.grapple||this.pin)break;}
    if(this.grapple||this.pin){this.remember(inputs);return;}
    // Capture both contacts before applying either. One hit must not cancel the other by update order.
    const contacts=[this.contact(0),this.contact(1)].filter(Boolean);
    for(const contact of contacts)this.resolveAttack(contact);
    const [a,b]=this.fighters;
    if(!unavailable(a)&&!unavailable(b)&&a.z<50&&b.z<50&&Math.abs(a.x-b.x)<66){
      const left=a.x<=b.x?a:b,right=left===a?b:a;
      const center=clamp((left.x+right.x)/2,LEFT+33,RIGHT-33);left.x=center-33;right.x=center+33;
    }
    this.remember(inputs);
    if(a.hp<=0&&b.hp<=0)this.endRound(null,'DOUBLE KO');
    else if(a.hp<=0||b.hp<=0)this.endRound(a.hp<=0?1:0,'KNOCKOUT');
  }
  bufferInput(f,input,dt){
    if(f.buffer){f.buffer.remaining-=dt;if(f.buffer.remaining<=0)f.buffer=null;}
    for(const action of ['special','grapple','heavy','light','jump']){
      if(tap(input,f.last,action)){f.buffer={action,remaining:INPUT_BUFFER};break;}
    }
  }
  clearInputs(){for(const f of this.fighters){f.buffer=null;f.last=emptyInput();}}
  timeLimit(){const [a,b]=this.fighters;this.endRound(Math.abs(a.hp-b.hp)<.001?null:a.hp>b.hp?0:1,'TIME LIMIT');}
  remember(inputs){this.fighters.forEach((f,i)=>f.last={...(inputs[i]||emptyInput())});}
  updateFighter(f,enemy,input,dt,index){
    if(Math.abs(f.vx)>.1){f.x=clamp(f.x+f.vx*dt,LEFT,RIGHT);f.vx*=Math.exp(-14*dt);}else f.vx=0;
    if(f.z>0||f.vz>0){f.z+=f.vz*dt;f.vz-=1250*dt;if(f.z<=0){f.z=0;f.vz=0;this.emit('land',{index});}}
    if(f.state==='down'){
      f.downTime-=dt;
      if(tap(input,f.last,'light')||tap(input,f.last,'heavy'))f.downTime-=.11;
      if(f.downTime<=0){f.state='rise';f.t=0;f.invincible=.6;}return;
    }
    if(f.state==='rise'){if(f.t>.5){f.state='idle';f.t=0;}return;}
    if(f.stun>0){f.stun=Math.max(0,f.stun-dt);if(!f.stun){f.state=f.z>0?'jump':'idle';f.t=0;}return;}
    if(f.move){const m=MOVES[f.move];if(f.t>=m.startup+m.active+m.recovery){f.move=null;f.state='idle';f.t=0;}else return;}
    f.facing=enemy.x>=f.x?1:-1;
    const canAct=!input.block||f.z>0;
    const command=f.buffer?.action;
    if(canAct&&command==='grapple'&&f.z===0){
      f.buffer=null;
      if(enemy.state==='down'&&Math.abs(f.x-enemy.x)<125){this.startPin(index);return;}
      if(enemy.z===0&&enemy.state!=='rise'&&enemy.invincible===0&&Math.abs(f.x-enemy.x)<106){this.startGrapple(index);return;}
      f.move='light';f.state='light';f.t=0;f.hit=true;this.emit('whiff',{index});return;
    }
    for(const key of ['special','heavy','light']){
      if(canAct&&command===key){
        f.buffer=null;
        if(key==='special'&&f.meter<100){this.emit('notReady',{index});continue;}
        if(key==='special'){f.meter=0;this.emit('special',{index});}
        f.state=key;f.move=key;f.t=0;f.hit=false;this.emit('swing',{index,move:key});return;
      }
    }
    if(command==='jump'&&f.z===0&&!input.block){f.buffer=null;f.vz=615;f.state='jump';f.t=0;this.emit('jump',{index});return;}
    if(input.block&&f.z===0){if(f.state!=='block'){f.t=0;f.state='block';}f.guard=Math.min(100,f.guard+dt*7);return;}
    f.guard=Math.min(100,f.guard+dt*18);
    const movement=Number(input.right)-Number(input.left);
    if(movement){f.walkDirection=movement;f.x=clamp(f.x+movement*245*f.definition.speed*(f.z>0?.84:1)*dt,LEFT,RIGHT);if(f.z===0&&f.state!=='walk'){f.state='walk';f.t=0;}}
    else if(f.z===0&&f.state!=='idle'){f.state='idle';f.t=0;}
  }
  contact(index){
    const f=this.fighters[index],e=this.fighters[1-index];if(!f.move||f.hit)return;
    const m=MOVES[f.move];if(f.t<m.startup||f.t>m.startup+m.active)return;
    if(e.state==='down'||e.state==='rise'||e.invincible>0)return;
    const dx=e.x-f.x;if(Math.abs(dx)>m.reach||dx*f.facing<0||Math.abs(f.z-e.z)>105)return;
    return {index,move:f.move,facing:f.facing,blocked:e.state==='block'&&e.facing===-f.facing&&e.z===0,combo:e.stun>0};
  }
  resolveAttack({index,move,facing,blocked,combo}){
    const f=this.fighters[index],e=this.fighters[1-index],m=MOVES[move];
    f.hit=true;
    if(blocked){
      const guardCost=move==='special'?55:move==='heavy'?30:14;e.guard-=guardCost;
      if(e.guard>0){e.vx=facing*m.knock*5;e.meter=clamp(e.meter+4,0,100);f.meter=clamp(f.meter+2,0,100);f.combo=0;this.hitStop=.04;this.emit('block',{index:1-index,x:(f.x+e.x)/2,z:e.z});return;}
      e.guard=0;e.stun=.85;this.emit('guardBreak',{index:1-index});
    }
    const damage=m.damage*f.definition.power/e.definition.toughness;
    e.hp=Math.max(0,e.hp-damage);e.meter=clamp(e.meter+damage*.8,0,100);f.meter=clamp(f.meter+m.meter,0,100);
    e.move=null;e.buffer=null;e.stun=Math.max(e.stun,m.stun);e.state='hurt';e.t=0;
    e.vx=facing*m.knock*14;f.combo=combo?f.combo+1:1;f.comboTime=1.2;
    this.hitStop=Math.max(this.hitStop,move==='light'?.045:.085);this.shake=Math.max(this.shake,move==='light'?3:8);
    this.emit('hit',{index:1-index,attacker:index,move,x:e.x-facing*25,z:e.z,damage,combo:f.combo});
    if(move==='special'||e.hp<=0||(move==='heavy'&&e.hp<42)){e.state='down';e.downTime=e.hp<25?3.7:2.5;e.stun=0;e.z=0;e.vz=0;}
  }
  startGrapple(index){
    const a=this.fighters[index],b=this.fighters[1-index];
    this.grapple={attacker:index,time:0,released:false,startX:b.x,fromX:a.x,throwDir:a.x<LEFT+180?1:a.x>RIGHT-180?-1:a.facing};
    a.state='grapple';a.t=0;a.move=null;a.vx=0;a.buffer=null;b.state='grabbed';b.move=null;b.vx=0;b.t=0;b.stun=0;this.emit('grapple',{index});
  }
  updateGrapple(dt){
    const g=this.grapple,a=this.fighters[g.attacker],b=this.fighters[1-g.attacker];g.time+=dt;
    const t=g.time;a.t=t;b.t=t;
    if(t<=THROW_BREAK_WINDOW&&b.buffer?.action==='grapple'){this.breakGrapple();return;}
    if(t<.32){b.x=g.startX+(clamp(a.x+a.facing*62,LEFT,RIGHT)-g.startX)*smooth(t/.32);b.z=0;}
    else if(t<.84){
      const lift=smooth((t-.32)/.52);b.z=110+135*lift;
      const beside=clamp(a.x+a.facing*62,LEFT,RIGHT);b.x=beside+(a.x+a.facing*12-beside)*lift;b.state='lifted';
    }
    else{
      if(!g.released){g.released=true;a.facing=g.throwDir;a.state='throw';a.t=0;b.state='thrown';b.vz=135;this.emit('throw',{index:g.attacker});}
      a.t=t-.84;b.t=t-.84;
      b.x=clamp(b.x+g.throwDir*330*dt,LEFT,RIGHT);b.z+=b.vz*dt;b.vz-=1450*dt;
      if(b.z<=30){
        b.z=0;b.vz=0;b.hp=Math.max(0,b.hp-17*a.definition.power/b.definition.toughness);b.meter=clamp(b.meter+15,0,100);a.meter=clamp(a.meter+20,0,100);b.state='down';b.downTime=b.hp<35?3.8:2.6;b.t=0;b.invincible=.1;a.state='idle';a.t=0;this.grapple=null;this.hitStop=.11;this.shake=11;this.emit('slam',{x:b.x,index:1-g.attacker});
        if(b.hp<=0)this.endRound(g.attacker,'KNOCKOUT');
      }
    }
  }
  breakGrapple(){
    const g=this.grapple;
    for(let i=0;i<2;i++){const f=this.fighters[i];f.state='hurt';f.t=0;f.stun=.24;f.buffer=null;f.move=null;f.z=0;f.vz=0;f.vx=(i===g.attacker?-1:1)*this.fighters[g.attacker].facing*260;f.invincible=.3;}
    this.grapple=null;this.emit('throwBreak');
  }
  startPin(index){
    const a=this.fighters[index],b=this.fighters[1-index];a.state='pin';a.t=0;a.buffer=null;a.vx=0;b.vx=0;b.buffer=null;b.state='pinned';b.t=0;this.pin={attacker:index,time:0,count:0,escape:0,lastButton:null,startX:a.x,targetX:clamp(b.x-a.facing*23,LEFT,RIGHT)};this.emit('pin',{index});
  }
  updatePin(inputs,dt){
    const p=this.pin,a=this.fighters[p.attacker],b=this.fighters[1-p.attacker],input=inputs[1-p.attacker]||emptyInput();p.time+=dt;
    a.x=p.startX+(p.targetX-p.startX)*smooth(p.time/.2);
    const need=7+Math.round((100-b.hp)*.10);
    const pressed=['light','heavy'].filter(key=>tap(input,b.last,key));
    if(pressed.length===1&&pressed[0]!==p.lastButton){p.escape++;p.lastButton=pressed[0];}
    if(this.options.mode!=='local'&&p.attacker===0){
      const level=this.options.difficulty==='hard'?1.2:this.options.difficulty==='easy'?.65:1;
      p.escape+=dt*(b.hp>55?12:b.hp>30?7:3.2)*level;
    }
    // Healthy opponents naturally resist an early pin, even without input.
    if(b.hp>60)p.escape+=dt*6;
    const count=Math.min(3,Math.floor(p.time/.9));if(count>p.count){p.count=count;this.emit('count',{count});}
    if(p.escape>=need){b.state='rise';b.t=0;b.buffer=null;b.invincible=.8;a.state='idle';a.t=0;a.buffer=null;a.vx=-a.facing*900;this.pin=null;this.emit('kickout');}
    else if(p.count>=3){this.pin=null;b.state='down';this.endRound(p.attacker,'PINFALL');}
  }
  endRound(winner,method){
    if(this.phase!=='fight')return;
    this.phase='roundEnd';this.phaseTime=0;this.roundWinner=winner;this.method=method;this.grapple=null;this.pin=null;
    for(let i=0;i<2;i++){const f=this.fighters[i];f.z=0;f.vz=0;f.vx=0;f.move=null;f.buffer=null;f.stun=0;f.t=0;if(i!==winner)f.state=f.hp<=0||f.state==='down'||method==='PINFALL'?'down':'defeat';}
    if(winner!==null){this.wins[winner]++;this.fighters[winner].state='victory';this.fighters[winner].t=0;}
    this.emit('roundEnd',{winner,method});
  }
  cpu(dt){
    const me=this.fighters[1],enemy=this.fighters[0],diff=this.options.difficulty;
    const rate=diff==='hard'?.13:diff==='easy'?.34:.22;
    this.aiTimer-=dt;
    if(this.aiTimer>0)return this.aiInput;
    this.aiTimer=rate+this.random()*.11;
    const v=emptyInput(),distance=Math.abs(me.x-enemy.x),toward=me.x<enemy.x?'right':'left',away=me.x<enemy.x?'left':'right';
    if(this.pin){this.aiInput=v;return v;}
    if(this.grapple){if(this.grapple.attacker===0&&this.grapple.time<THROW_BREAK_WINDOW&&this.random()<(diff==='hard'?.6:diff==='easy'?.05:.25))v.grapple=true;this.aiInput=v;return v;}
    if(me.state==='down'){v[this.random()<.5?'light':'heavy']=true;this.aiInput=v;return v;}
    if(distance>110)v[toward]=true;
    if(enemy.move&&distance<165&&this.random()<(diff==='easy'?.28:diff==='hard'?.85:.6))v.block=true;
    else if(distance<140){
      const r=this.random();
      if(enemy.state==='down'&&distance<120)v.grapple=true;
      else if(me.meter>=100&&r<.6)v.special=true;
      else if(distance<100&&r<.20)v.grapple=true;
      else if(r<.54)v.light=true;
      else if(r<.86)v.heavy=true;
      else v[away]=true;
    }
    if(distance>155&&distance<320&&this.random()<.10)v.jump=true;
    this.aiInput=v;return v;
  }
}
