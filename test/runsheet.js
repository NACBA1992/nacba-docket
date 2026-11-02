const fs=require('fs'),vm=require('vm'),path=require('path');
let s=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8')
 .split('<script type="module">')[1].split('</script>')[0];
s=s.replace(/^import .*$/m,'')
   .replace(/^const sb =.*$/m,'var sb={auth:{onAuthStateChange(){},getSession:async()=>({data:{}})}};')
   .replace(/^const app = .*$/m,'var app=global.__a;')
   .replace(/^const /gm,'var ').replace(/^let /gm,'var ');
const handlers=[];
const mkEl=(a={})=>({innerHTML:'',textContent:'',className:'',value:'',hidden:true,checked:false,
  classList:{contains:()=>false},getAttribute:k=>a[k]??null,
  addEventListener:(ev,fn)=>handlers.push({ev,fn,attrs:a}),
  querySelectorAll:()=>[],scrollIntoView(){},focus(){},remove(){}});
global.__a=mkEl(); const st={};
global.__a.querySelectorAll=sel=>{const m=/\[data-([a-z]+)\]/.exec(sel);if(!m)return[];
  const k='data-'+m[1];const a={};a[k]='x';return[mkEl(a)];};
global.document={getElementById:i=>(st[i]=st[i]||mkEl()),querySelectorAll:()=>[],
  querySelector:()=>null,createElement:mkEl,body:{appendChild(){}}};
global.window={scrollTo(){},addEventListener(){},open:()=>null,prompt:()=>null};
global.location={href:'https://x/'}; global.localStorage={getItem:()=>null,setItem(){}};
global.setTimeout=()=>{}; global.clearTimeout=()=>{}; global.navigator={clipboard:{}};
vm.runInThisContext(s);

session={user:{email:'t@x.com'}}; myRole='admin'; team=[]; links={}; uploads={}; history=[];
roster=[]; spkCats={}; progCats={}; categories=[]; ideas=[]; ideaCats={}; metrics={};
const today=todayUTC(), iso=d=>d.toISOString().slice(0,10);
programs=[{
 id:'p1', event_date:iso(today), kind:'vendor', archived:false, title:'Live Today',
 description:'', note:'', venue:'', location:'', store_url:'', recording_url:'',
 program_speakers:[{id:'ps1',topic:'Escrow',confirmation:'confirmed',sort_order:0,
   speakers:{id:'s1',full_name:'Hon. Pat Ellery',preferred_title:'Judge',firm:'Court',
     address:'',email:'p@court.gov',phone:'(760) 555-0100',pronunciation:'ELL-uh-ree',
     headshot_location:'',bio_location:'',speaker_type:'judge',
     name_audio_at:'2026-08-15T00:00:00Z'},deliverables:[]}],
 tasks:[]}];
runSheet={p1:[
 {id:'r1',program_id:'p1',phase:'before',seq:10,step:'Open the webinar 30 minutes before the start time',source:'§6.4',done:true,done_by:'tara@salinaslawgroup.com'},
 {id:'r2',program_id:'p1',phase:'before',seq:60,step:'Confirm the recording has started',source:'§6.4',done:false,done_by:''},
 {id:'r3',program_id:'p1',phase:'start',seq:10,step:'Begin on time',source:'§6.4',done:false,done_by:''},
 {id:'r4',program_id:'p1',phase:'during',seq:20,step:'Launch the polls at the planned points',source:'§6.4',done:false,done_by:''},
 {id:'r5',program_id:'p1',phase:'close',seq:10,step:'Confirm CLE attendance-tracking requirements are satisfied',source:'§6.4',done:false,done_by:''}]};

let fails=0;
const check=(l,t)=>{console.log(l);t.forEach(([n,f])=>{let ok=false;try{ok=f();}catch(e){}
  if(!ok)fails++;console.log((ok?'    ok   ':'    FAIL ')+n);});};
const base={name:'season',id:null,edit:false,editSpeaker:null,editRoster:false,creating:false,
  cat:null,stype:null,q:'',speakerId:null,istatus:null,editIdea:null,editStats:false};

view={...base,tab:'runsheet',id:'p1'}; render(); let h=global.__a.innerHTML;
check('run sheet:',[
 ['all four phases present', ()=>['Before we go live','Going live','During the program','Closing']
    .every(x=>h.includes(x))],
 ['progress counted', ()=>h.includes('1 of 5 steps done')],
 ['steps checkable', ()=>(h.match(/data-run=/g)||[]).length===5],
 ['done step marked', ()=>h.includes('is-done')],
 ['who ticked it', ()=>h.includes('tara')],
 ['checklist cites the source', ()=>h.includes('§6.4')],
 ['speaker on air', ()=>h.includes('Hon. Pat Ellery')],
 ['how to introduce them', ()=>h.includes('Introduce as: Judge')],
 ['pronunciation shown', ()=>h.includes('ELL-uh-ree')],
 ['name audio playable', ()=>h.includes('data-hear="s1"')],
 ['phone is tappable', ()=>h.includes('href="tel:7605550100"')],
 ['email is a link', ()=>h.includes('mailto:p@court.gov')],
 ['vendor disclosure warned', ()=>h.includes('Sponsored program')],
 ['no undefined', ()=>!h.includes('undefined')],
]);

view={...base,name:'detail',tab:'upcoming',id:'p1'}; render(); h=global.__a.innerHTML;
check('program page:',[
 ['run sheet reachable', ()=>h.includes('data-runsheet="p1"')],
]);
view={...base,tab:'all'}; render(); h=global.__a.innerHTML;
check('season card, program is today:',[
 ['card flags the run sheet', ()=>h.includes('Run sheet ready')],
 ['flag is inside a card', ()=>/class="card[^"]*"[^]*?Run sheet ready/.test(h)],
 ['vendor type shown on card', ()=>/class="card-foot"[^]*?Sponsored Webinar \/ Vendor Program/.test(h)],
]);
process.exit(fails?1:0);
