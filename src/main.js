import {Match,STEP} from './engine.js';
import {Renderer} from './render.js';
import {Input} from './input.js';
import {Sound} from './audio.js';
const $=id=>document.getElementById(id);
const selection=$('selection'),pauseScreen=$('pause'),resultScreen=$('result'),helpScreen=$('help');
let roster=[],atlases={},arenas=[],renderer,match=null,chosen=0,arena=0,paused=false,helpWasPaused=false,arcadeOpponents=[],arcadeIndex=0,session=0,loading=false,returnFocus=null;
const imagePromises=new Map();
const sound=new Sound();
const input=new Input(force=>togglePause(force));
const loadingImage=url=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(`Could not load ${url}`));image.src=url;});
function status(text){$('announcement').textContent=text;}
function modalState(){const active=[helpScreen,resultScreen,pauseScreen].find(el=>!el.hidden);selection.inert=Boolean(active);for(const el of [helpScreen,resultScreen,pauseScreen])el.inert=Boolean(active&&el!==active);updateTouch();return active;}
function showModal(element,button){returnFocus=document.activeElement;element.hidden=false;modalState();button?.focus();}
function hideModal(element){element.hidden=true;const active=modalState();if(active)active.querySelector('button')?.focus();else returnFocus?.focus?.();}
function updateTouch(){const showing=Boolean(match&&selection.hidden&&match.phase!=='done'&&matchMedia('(any-pointer:coarse)').matches);$('touch-controls').hidden=!showing;$('cabinet').classList.toggle('playing-touch',showing);$('touch-controls').inert=paused||!helpScreen.hidden||!resultScreen.hidden;$('touch-controls').classList.toggle('inactive',$('touch-controls').inert);}
function choose(index){chosen=index;const f=roster[index];
  document.querySelectorAll('.fighter-card').forEach((b,i)=>{b.setAttribute('aria-pressed',String(i===index));b.tabIndex=i===index?0:-1;});
  $('portrait').src=`./assets/${f.id}-portrait.png`;$('portrait').alt=f.name;$('fighter-name').textContent=f.name;$('fighter-style').textContent=f.style.toUpperCase();
  $('stats').replaceChildren();for(const [label,value] of [['POWER',f.power],['SPEED',f.speed],['GRIT',f.toughness]]){const stat=document.createElement('div');stat.className='stat';const name=document.createElement('span');name.textContent=label;const track=document.createElement('i');track.className='stat-track';const fill=document.createElement('i');fill.className='stat-fill';fill.style.width=`${Math.round((value-.6)*170)}%`;track.append(fill);stat.append(name,track);$('stats').append(stat);}
  updateOpponent();
}
function updateOpponent(){
  if(!roster.length)return;
  const mode=$('mode').value,opponent=roster[Number($('opponent').value)||0];
  $('versus-name').textContent=mode==='arcade'?'EIGHT OPPONENTS. ONE CHAMPION.':`VS ${opponent.name.toUpperCase()}`;
  $('versus-avatar').hidden=mode==='arcade';$('versus-avatar').src=`./assets/${opponent.id}-portrait.png`;
  $('versus-label').textContent=mode==='arcade'?'ARCADE RUN':mode==='local'?'PLAYER 2':'CPU OPPONENT';
}
function buildRoster(){
  roster.forEach((f,i)=>{
    const b=document.createElement('button');b.className='fighter-card';b.style.setProperty('--fighter',f.color);b.setAttribute('aria-label',f.name);b.setAttribute('aria-pressed','false');
    const img=document.createElement('img');img.src=`./assets/${f.id}-portrait.png`;img.alt='';const name=document.createElement('span');name.textContent=f.name.toUpperCase();b.append(img,name);b.onclick=()=>choose(i);$('roster').append(b);
    const option=document.createElement('option');option.value=i;option.textContent=f.name.toUpperCase();$('opponent').append(option);
  });$('opponent').value='1';choose(0);
  $('mode').onchange=()=>{const mode=$('mode').value;$('difficulty-label').hidden=mode==='local';$('opponent').parentElement.hidden=mode==='arcade';$('opponent-label').textContent=mode==='local'?'PLAYER 2':'OPPONENT';updateOpponent();};
  $('opponent').onchange=updateOpponent;
  $('roster').addEventListener('keydown',event=>{const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-3,ArrowDown:3}[event.key];if(delta){event.preventDefault();choose((chosen+delta+roster.length)%roster.length);$('roster').children[chosen].focus();}});
}
async function loadFighter(index){
  if(atlases[index])return;
  if(!imagePromises.has(index))imagePromises.set(index,loadingImage(roster[index].atlas).then(image=>{atlases[index]=image;}).catch(error=>{imagePromises.delete(index);throw error;}));
  await imagePromises.get(index);
}
async function startMatch(nextArcade=false){
  if(loading)return;loading=true;const thisSession=++session;$('fight').disabled=true;$('fight').textContent='ENTERING THE RING…';
  try{
    const mode=$('mode').value;arena=Number($('arena').value);
    if(mode==='arcade'&&!nextArcade){arcadeOpponents=roster.map((_,i)=>i).filter(i=>i!==chosen); // Fisher-Yates keeps an unbiased, complete eight-opponent run.
      for(let i=arcadeOpponents.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arcadeOpponents[i],arcadeOpponents[j]]=[arcadeOpponents[j],arcadeOpponents[i]];}arcadeIndex=0;}
    const opponent=mode==='arcade'?arcadeOpponents[arcadeIndex]:Number($('opponent').value);
    if(mode==='arcade')arena=(Number($('arena').value)+arcadeIndex)%4;
    await Promise.all([loadFighter(chosen),loadFighter(opponent)]);
    if(thisSession!==session)return;
    match=new Match(roster,chosen,opponent,{mode,difficulty:$('difficulty').value,arcadeIndex});
    paused=false;selection.hidden=true;pauseScreen.hidden=true;resultScreen.hidden=true;helpScreen.hidden=true;modalState();input.active=true;input.clear();renderer.reset();$('pause-button').hidden=false;updateTouch();sound.resume();
    $('footer-status').textContent=mode==='local'?'LOCAL VERSUS · TWO PLAYERS. ONE RING.':mode==='arcade'?`ARCADE RUN · OPPONENT ${arcadeIndex+1} OF 8`:'VS CPU · BEST OF THREE';
    document.activeElement?.blur();status(`Round 1. ${roster[chosen].name} versus ${roster[opponent].name}.`);
  }catch(error){status('The fighter artwork could not load. Try again.');$('footer-status').textContent='COULD NOT LOAD FIGHTER ARTWORK. PRESS FIGHT TO RETRY.';console.error(error);}
  finally{loading=false;$('fight').disabled=false;$('fight').textContent='FIGHT';}
}
function togglePause(force){
  if(!match||match.phase==='done'||!selection.hidden||!helpScreen.hidden)return;
  paused=force===true?true:!paused;input.clear();match.clearInputs();if(paused){showModal(pauseScreen,$('resume'));sound.suspend();}else{pauseScreen.hidden=true;modalState();sound.resume();document.activeElement?.blur();}updateTouch();
}
function quit(){session++;match=null;paused=false;input.active=false;input.clear();selection.hidden=false;pauseScreen.hidden=true;resultScreen.hidden=true;helpScreen.hidden=true;modalState();renderer.reset();sound.resume();$('pause-button').hidden=true;updateTouch();$('footer-status').textContent='SELECT YOUR FIGHTER. SETTLE IT IN THE RING.';$('fight').focus();}
function finishMatch(){
  input.active=false;input.clear();$('pause-button').hidden=true;
  const won=match.winner===0,arcade=match.options.mode==='arcade',champion=arcade&&won&&arcadeIndex===7;
  $('result-title').textContent=champion?'LUNACY CHAMPION':`${match.fighters[match.winner].definition.name.toUpperCase()} WINS`;
  $('result-method').textContent=champion?'ALL EIGHT OPPONENTS DEFEATED':match.method;
  $('result-detail').textContent=`${match.wins[0]} — ${match.wins[1]}${arcade?` · ${Math.min(8,arcadeIndex+(won?1:0))} of 8 opponents defeated`:''}`;
  const winner=match.fighters[match.winner].definition;$('winner-portrait').src=`./assets/${winner.id}-portrait.png`;$('winner-portrait').alt=winner.name;
  $('rematch').textContent=arcade&&won&&!champion?'NEXT OPPONENT':arcade?'NEW ARCADE RUN':'REMATCH';
  showModal(resultScreen,$('rematch'));status($('result-title').textContent);
}
$('fight').onclick=()=>startMatch();$('pause-button').onclick=()=>togglePause();$('resume').onclick=()=>togglePause();$('restart').onclick=()=>startMatch(match?.options.mode==='arcade');$('quit').onclick=quit;$('result-quit').onclick=quit;
$('rematch').onclick=()=>{if(match.options.mode==='arcade'&&match.winner===0&&arcadeIndex<7){arcadeIndex++;startMatch(true);}else startMatch();};
$('arena').onchange=()=>{arena=Number($('arena').value);};
$('controls').onclick=()=>{if(!helpScreen.hidden)return;helpWasPaused=paused;if(match){paused=true;input.clear();match.clearInputs();}sound.suspend();showModal(helpScreen,$('close-help'));};
function closeHelp(){paused=helpWasPaused;hideModal(helpScreen);input.clear();match?.clearInputs();if(!paused)sound.resume();updateTouch();}
$('close-help').onclick=closeHelp;
$('sound').onclick=async()=>{const on=await sound.enable();$('sound').textContent=on?'SOUND ON':'SOUND OFF';$('sound').setAttribute('aria-pressed',String(on));$('sound').setAttribute('aria-label',on?'Mute sound':'Enable sound');if(paused)sound.suspend();};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if($('cabinet').requestFullscreen)await $('cabinet').requestFullscreen();else status('Fullscreen is not available in this browser.');}catch{status('Fullscreen is not available in this browser.');}};
addEventListener('resize',updateTouch);
// Trap focus within the active modal and restore it when the modal closes.
addEventListener('keydown',e=>{
  const modal=[helpScreen,resultScreen,pauseScreen].find(el=>!el.hidden);if(!modal)return;
  if(e.code==='Escape'&&!helpScreen.hidden){e.preventDefault();closeHelp();return;}
  if(e.key==='Tab'){const buttons=Array.from(modal.querySelectorAll('button:not([disabled])')),first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
});
let last=performance.now(),accumulator=0;
function loop(now){
  const delta=Math.min((now-last)/1000,.10);last=now;
  if(match&&!paused&&match.phase!=='done'){
    accumulator+=delta;
    while(accumulator>=STEP){const controls=input.read();if(paused){accumulator=0;break;}match.step(controls,STEP);accumulator-=STEP;
      const events=match.drainEvents();renderer.receive(events);sound.play(events);
      for(const e of events){if(e.type==='fight')status('Fight!');if(e.type==='count')status(`Pin count ${e.count}`);if(e.type==='roundEnd')status(e.winner===null?'Round drawn':`${match.fighters[e.winner].definition.name} wins the round by ${e.method.toLowerCase()}`);if(e.type==='matchEnd')finishMatch();}
    }
  }else{accumulator=0;if(match)input.read();}
  if(renderer){renderer.scheme=input.scheme;renderer.draw(match,arena,paused?0:delta,!selection.hidden);}requestAnimationFrame(loop);
}
async function init(){
  try{
    const response=await fetch('./assets/roster.json');if(!response.ok)throw new Error('Roster unavailable');roster=await response.json();buildRoster();
    arenas=await Promise.all([0,1,2,3].map(i=>loadingImage(`./assets/arena-${i}.jpg`)));
    renderer=new Renderer($('game'),roster,atlases,arenas);$('fight').disabled=false;$('fight').textContent='FIGHT';requestAnimationFrame(loop);
  }catch(error){$('fight').textContent='RELOAD GAME';$('fight').disabled=false;$('fight').onclick=()=>location.reload();$('footer-status').textContent='GAME FILES COULD NOT LOAD. USE THE INCLUDED LOCAL SERVER OR GITHUB PAGES.';console.error(error);}
}
init();
