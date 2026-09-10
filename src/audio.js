export class Sound {
  constructor(){this.enabled=false;this.context=null;this.music=new Audio();this.music.src=this.music.canPlayType('audio/ogg; codecs=vorbis')?'./assets/fight-club.ogg':'./assets/fight-club.mp3';this.music.loop=true;this.music.volume=.22;this.music.preload='none';this.suspended=false;}
  async enable(){
    this.enabled=!this.enabled;
    if(this.enabled){try{const AudioContext=window.AudioContext||window.webkitAudioContext;this.context ||= new AudioContext();await this.context.resume();if(!this.suspended)await this.music.play();}catch{ /* Music codec/autoplay failure does not interrupt a match. */ }}else this.music.pause();
    return this.enabled;
  }
  suspend(){this.suspended=true;this.music.pause();}
  resume(){this.suspended=false;if(this.enabled){this.context?.resume().catch(()=>{});this.music.play().catch(()=>{});}}
  tone(freq,duration=.1,type='square',volume=.08,end=40){
    if(!this.enabled||this.suspended||!this.context)return;const c=this.context,osc=c.createOscillator(),gain=c.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,c.currentTime);osc.frequency.exponentialRampToValueAtTime(Math.max(1,end),c.currentTime+duration);gain.gain.setValueAtTime(volume,c.currentTime);gain.gain.exponentialRampToValueAtTime(.001,c.currentTime+duration);osc.connect(gain);gain.connect(c.destination);osc.start();osc.stop(c.currentTime+duration);
  }
  play(events){for(const e of events){switch(e.type){case 'hit':this.tone(e.move==='heavy'?110:190,.13,'sawtooth',.10);break;case 'slam':this.tone(90,.35,'triangle',.3,22);break;case 'throwBreak':this.tone(410,.17,'triangle',.11,650);break;case 'kickout':this.tone(500,.22,'triangle',.12,850);break;case 'block':this.tone(560,.08,'square',.055,160);break;case 'fight':this.tone(880,.45,'square',.075,880);break;case 'count':this.tone(620,.15,'triangle',.17,500);break;case 'special':this.tone(160,.6,'sawtooth',.08,1100);break;case 'roundEnd':this.tone(700,.5,'triangle',.13,280);break;case 'grapple':this.tone(120,.08,'triangle',.06,70);break;case 'swing':this.tone(260,.06,'triangle',.025,60);break;}}}
}
