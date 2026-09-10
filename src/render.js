import {FLOOR,MOVES} from './engine.js';
const ARENA_NAMES=['BLOODYMANIA','HELL’S PIT','CARNIVAL OF CARNAGE','HOUSE OF HORRORS'];
const fit=(n,min,max)=>Math.max(min,Math.min(max,n));
export class Renderer {
  constructor(canvas,roster,atlases,arenas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.roster=roster;this.atlases=atlases;this.arenas=arenas;this.reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;this.scheme='keyboard';this.reset();}
  reset(){this.particles=[];this.popups=[];this.flash=0;this.healthTrail=[100,100];this.healthWait=[0,0];this.lastHealth=[100,100];this.lastMeter=[0,0];this.shakeOffset=[0,0];this.clock=0;}
  receive(events){for(const e of events){
    if(['hit','slam','block'].includes(e.type)){
      const color=e.type==='block'?'#7bd6ff':e.type==='slam'?'#fa258c':'#c1ff32';const y=e.type==='slam'?FLOOR-10:FLOOR-135-(e.z||0);
      if(!this.reduced)for(let i=0;i<14;i++){const a=Math.random()*Math.PI*2,s=50+Math.random()*300;this.particles.push({x:e.x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.20+Math.random()*.24,max:.45,color,size:2+Math.random()*5});}
      if(e.type==='hit'&&e.combo>1)this.popups.push({text:`${e.combo} HIT`,x:e.x,y:y-90,life:.65,color:'#c1ff32'});
    }
    if(e.type==='special')this.flash=.18;
    if(e.type==='round')this.reset();
    if(e.type==='throwBreak')this.popups.push({text:'THROW BREAK',x:640,y:300,life:.9,color:'#8ee7ff'});
    if(e.type==='notReady')this.popups.push({text:'BUILD YOUR LUNACY METER',x:640,y:225,life:.7,color:'#e8dfea'});
    if(e.type==='kickout')this.popups.push({text:'KICK OUT!',x:640,y:350,life:1,color:'#b0ff20'});
    if(e.type==='guardBreak')this.popups.push({text:'GUARD BREAK',x:640,y:340,life:.85,color:'#fa2484'});
  }}
  text(text,x,y,size=24,color='#f5f0e6',align='left',italic=false){const c=this.ctx;c.font=`${italic?'italic ':''}900 ${size}px Arial, sans-serif`;c.textAlign=align;c.fillStyle=color;c.fillText(text,x,y);}
  draw(match,arena=0,dt=1/60,menu=false){
    const c=this.ctx;c.save();c.clearRect(0,0,1280,720);c.fillStyle='#130b18';c.fillRect(0,0,1280,720);
    this.clock+=dt;
    if(dt>0)this.shakeOffset=match?.shake&&!this.reduced&&!menu?[(Math.random()-.5)*match.shake,(Math.random()-.5)*match.shake*.55]:[0,0];
    c.translate(...this.shakeOffset);
    const bg=this.arenas[arena];if(bg)c.drawImage(bg,0,0,1280,720);
    // Keep the supplied ring and arena visible; tint only the upper HUD area.
    const shade=c.createLinearGradient(0,0,0,210);shade.addColorStop(0,'#08060cf5');shade.addColorStop(.65,'#08060caa');shade.addColorStop(1,'#08060c00');c.fillStyle=shade;c.fillRect(0,0,1280,210);
    if(match&&!menu){
      // Downed opponent is below the attacker during a pin; neither sheet contains an extra wrestler.
      const order=match.pin?[1-match.pin.attacker,match.pin.attacker]:match.grapple?[match.grapple.attacker,1-match.grapple.attacker]:[0,1];
      for(const i of order)this.fighter(match.fighters[i],i,match);
      this.effects(dt);c.restore();c.save();this.hud(match,arena,dt);this.banners(match);
    }
    c.restore();
  }
  fighter(f,index,match){
    const c=this.ctx,def=f.definition,atlas=this.atlases[f.id],animations=def.animations;
    if(!atlas)return;
    let anim='idle',progress=null,rotation=0,offsetX=0,offsetY=0,scaleX=1,scaleY=1,centered=false;
    switch(f.state){
      case 'walk':anim='walk';break;
      case 'jump':anim='jump';progress=.5;break;
      case 'block':anim='lift';progress=0;scaleX=.98;break;
      case 'light':anim='lift';progress=f.t<MOVES.light.startup?0:1/(animations.lift.length||1);offsetX=Math.sin(fit(f.t/.43,0,1)*Math.PI)*19;break;
      case 'heavy':anim='heavy';progress=f.t<.29?(f.t/.29)*.5:f.t<.45?.5+(f.t-.29)/.16*.25:.75+fit((f.t-.45)/.42,0,.999)*.249;break;
      case 'special':anim='heavy';progress=f.t<.19?(f.t/.19)*.5:f.t<.37?.5+(f.t-.19)/.18*.25:.75+fit((f.t-.37)/.65,0,.999)*.249;break;
      case 'hurt':anim='hurt';break;
      case 'down':case 'pinned':anim='down';progress=.8;break;
      case 'rise':anim='rise';progress=fit(f.t/.5,0,.999);break;
      case 'grapple':anim='lift';progress=fit((match.grapple?.time||0)/.84,0,.999);break;
      case 'grabbed':anim='hurt';progress=0;break;
      case 'lifted':anim='idle';progress=0;centered=true;rotation=-Math.PI/2*fit(((match.grapple?.time||.84)-.32)/.42,0,1);break;
      case 'thrown':anim='idle';progress=0;centered=true;rotation=-Math.PI/2+Math.sin(f.t*5)*.13;break;
      case 'throw':anim='throw';progress=.6+fit(f.t/.5,0,.999)*.399;break;
      case 'pin':anim='pin';progress=Math.min(.999,fit(f.t/.24,0,1));break;
      case 'defeat':anim='rise';progress=.35;break;
      case 'victory':anim='victory';break;
    }
    const fs=animations[anim]?.length?animations[anim]:animations.idle;
    let fi=progress===null?Math.floor(f.t*(anim==='walk'?10*f.definition.speed:anim==='hurt'?7:4))%fs.length:Math.min(fs.length-1,Math.floor(progress*fs.length));
    if(anim==='walk'&&f.walkDirection*f.facing<0)fi=fs.length-1-fi;
    const entry=fs[fi];
    if(f.state==='idle'&&!this.reduced){const breath=Math.sin(f.t*3.4+index)*.005;scaleY=1+breath;scaleX=1-breath*.4;}
    // Shadows anchor feet to the canvas floor, independently of animation crop bounds.
    c.save();c.globalAlpha=.35*(1-fit(f.z/400,0,.8));c.fillStyle='#050305';c.beginPath();c.ellipse(f.x,FLOOR+3,f.state==='down'||f.state==='pinned'?88:45,10,0,0,Math.PI*2);c.fill();c.restore();
    c.save();c.translate(f.x+offsetX*f.facing,FLOOR-f.z+offsetY);c.scale(f.facing*scaleX,scaleY);c.rotate(rotation);
    if(f.state==='special'&&!this.reduced){c.shadowColor=def.color;c.shadowBlur=30;}
    if(f.invincible>0&&Math.floor(f.invincible*18)%2)c.globalAlpha=.65;
    c.drawImage(atlas,entry.x,entry.y,entry.w,entry.h,centered?-entry.w/2:-(entry.anchorX??entry.w/2),centered?-entry.h/2:-(entry.anchorY??entry.h),entry.w,entry.h);
    c.restore();
    if(f.state==='block'){
      c.save();c.strokeStyle=f.guard<25?'#ff5072':'#85dfff';c.lineWidth=3;c.globalAlpha=.6;c.beginPath();c.ellipse(f.x+f.facing*45,FLOOR-118,24,90,0,-Math.PI/2,Math.PI/2,f.facing<0);c.stroke();c.restore();
    }
    if(match.phase==='intro'){this.text(index?'P2':'P1',f.x,FLOOR+28,18,index?'#fa6daf':'#b0ff20','center');}
  }
  hud(m,arena,dt=1/60){
    const c=this.ctx,[a,b]=m.fighters;
    for(let i=0;i<2;i++){
      const f=i?b:a,x=i?738:44,w=498,color=i?'#fa268b':'#b0ff20';
      if(f.hp<this.lastHealth[i])this.healthWait[i]=.3;
      this.lastHealth[i]=f.hp;this.healthWait[i]=Math.max(0,this.healthWait[i]-dt);
      if(this.healthWait[i]===0)this.healthTrail[i]=Math.max(f.hp,this.healthTrail[i]-dt*55);
      if(f.hp>this.healthTrail[i])this.healthTrail[i]=f.hp;
      if(f.meter>=100&&this.lastMeter[i]<100)this.popups.push({text:`P${i+1} FINISHER READY`,x:i?990:290,y:170,life:1.2,color});
      this.lastMeter[i]=f.meter;
      c.fillStyle='#100d17ed';c.fillRect(x-10,22,w+20,109);
      this.text(f.definition.name.toUpperCase(),i?x+w:x,47,24,'#fff2e7',i?'right':'left',true);
      this.text(i?(m.options.mode==='local'?'PLAYER 2':'CPU'):'PLAYER 1',i?x:x+w,44,12,color,i?'left':'right');
      c.fillStyle='#3f2034';c.fillRect(x,59,w,22);c.fillStyle='#ffe6cc';const trail=w*this.healthTrail[i]/100;c.fillRect(i?x+w-trail:x,59,trail,22);c.fillStyle=color;const hp=w*f.hp/100;c.fillRect(i?x+w-hp:x,59,hp,22);
      c.fillStyle='#fff5';c.fillRect(i?x+w-hp:x,59,hp,3);
      c.fillStyle='#fff1';c.fillRect(x,87,w,3);c.fillStyle='#bceaff';const guard=w*f.guard/100;c.fillRect(i?x+w-guard:x,87,guard,3);
      c.fillStyle='#ffffff16';c.fillRect(x,101,w-143,8);c.fillStyle=f.meter>=100?'#fff8e3':color;c.fillRect(i?x+(w-143)*(1-f.meter/100):x,101,(w-143)*f.meter/100,8);
      this.text(f.meter>=100?'FINISHER READY':'LUNACY',x+w,111,14,f.meter>=100?'#f4f4d8':'#c3b5ca','right');
      for(let n=0;n<2;n++){c.fillStyle=m.wins[i]>n?color:'#ffffff22';c.beginPath();c.arc(i?x+w-n*19:x+n*19,124,5,0,Math.PI*2);c.fill();}
    }
    c.fillStyle='#100a19f5';c.fillRect(558,15,164,103);c.strokeStyle='#fff3';c.strokeRect(558,15,164,103);
    this.text(String(Math.ceil(m.remaining)).padStart(2,'0'),640,77,57,m.remaining<15?'#ff5671':'#f6f1e3','center',true);
    this.text(`ROUND ${m.round}`,640,102,13,'#b0ff20','center');
    c.fillStyle='#0c0716dd';c.fillRect(38,666,1204,31);this.text(ARENA_NAMES[arena],54,687,12,'#d4c5dd');
    const help=this.scheme==='gamepad'?'X STRIKE  /  Y HEAVY  /  B GRAPPLE  /  RB FINISHER':this.scheme==='touch'?'HIT  /  HEAVY  /  GRAB TO THROW OR PIN  /  FINISH':'J STRIKE  /  K HEAVY  /  L GRAPPLE + PIN  /  U FINISHER';
    this.text(m.pin?`P${2-m.pin.attacker}: ALTERNATE STRIKE + HEAVY TO ESCAPE`:help,640,687,12,m.pin?'#b0ff20':'#d4c5dd','center');
    this.text(m.options.mode==='arcade'?`ARCADE · ${(m.options.arcadeIndex||0)+1} / 8`:'BEST OF 3',1224,687,12,'#d4c5dd','right');
    if(m.pin){
      const p=m.pin,b=m.fighters[1-p.attacker],need=7+Math.round((100-b.hp)*.10);
      c.fillStyle='#0e0819e8';c.fillRect(460,180,360,72);this.text(`PIN COUNT  ${p.count||'—'}`,640,209,24,'#fff7e4','center',true);c.fillStyle='#39213f';c.fillRect(488,225,304,8);c.fillStyle='#b0ff20';c.fillRect(488,225,304*fit(p.escape/need,0,1),8);
    }
  }
  banners(m){
    const c=this.ctx;let title='',sub='',color='#f6efe5';
    if(m.phase==='intro'){title=m.phaseTime<1.55?`ROUND ${m.round}`:'FIGHT!';sub=m.phaseTime<1.55?'FIRST TO TWO FALLS':'';color=m.phaseTime<1.55?'#fff3e7':'#b0ff20';}
    if(m.phase==='roundEnd'){title=m.roundWinner===null?'DRAW':`${m.fighters[m.roundWinner].definition.name.toUpperCase()} WINS`;sub=m.method;}
    if(title){c.save();c.fillStyle='#0a071ac4';c.fillRect(0,280,1280,119);c.shadowColor='#000';c.shadowBlur=18;this.text(title,640,343,title.length>20?48:66,color,'center',true);this.text(sub,640,377,17,'#d4c6df','center');c.restore();}
  }
  effects(dt){
    const c=this.ctx;
    for(const p of this.particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=380*dt;c.globalAlpha=fit(p.life/p.max,0,1);c.fillStyle=p.color;c.fillRect(p.x,p.y,p.size,p.size);}c.globalAlpha=1;this.particles=this.particles.filter(p=>p.life>0);
    for(const p of this.popups){p.life-=dt;p.y-=dt*30;c.globalAlpha=fit(p.life*3,0,1);this.text(p.text,p.x,p.y,30,p.color,'center',true);}c.globalAlpha=1;this.popups=this.popups.filter(p=>p.life>0);
    if(this.flash>0){this.flash-=dt;if(!this.reduced){c.fillStyle=`rgba(180,255,35,${this.flash*.5})`;c.fillRect(0,0,1280,720);}}
  }
}
