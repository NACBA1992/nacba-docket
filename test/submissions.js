// What a coordinator can see without opening a speaker's packet, and what
// they can pull out of it. Fires the download/copy handlers rather than
// counting attributes: the Preview-email bug was two handlers and no markup.
const fs=require('fs'),vm=require('vm'),path=require('path');
let s=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8')
 .split('<script type="module">')[1].split('</script>')[0];
const rpcCalls=[], saved=[], copied=[];
s=s.replace(/^import .*$/m,'')
   .replace(/^const sb =.*$/m,`var sb={auth:{onAuthStateChange(){},getSession:async()=>({data:{}})},
     rpc:(name,args)=>{global.__rpc.push({name,args});
       return Promise.resolve({data:name==='speaker_headshot'
         ? {ok:true,mime:'image/jpeg',b64:global.__realJpegB64,at:'2026-11-12T18:04:00Z'}
         : {ok:true},error:null});}};`)
   .replace(/^const app = .*$/m,'var app=global.__a;')
   .replace(/^const /gm,'var ').replace(/^let /gm,'var ');
global.__rpc=rpcCalls;
// A genuine JPEG, not a header-shaped stub: downloadHeadshot now checks that
// a file is complete, and a fake image is indistinguishable from a truncated
// upload — which is the bug this fixture exists to stop us from shipping again.
global.__realJpegB64 = fs.readFileSync(path.join(__dirname,'fixtures','real.jpg'))
  .toString('base64').replace(/(.{76})/g,'$1\n');
const handlers=[];
const mkEl=(a={})=>({innerHTML:'',textContent:'',className:'',value:'',hidden:true,checked:false,
  classList:{contains:()=>false},getAttribute:k=>a[k]??null,
  addEventListener:(ev,fn)=>handlers.push({ev,fn,attrs:a}),
  querySelectorAll:()=>[],scrollIntoView(){},focus(){},remove(){},click(){saved.push(a.__dl||'click');}});
global.__a=mkEl(); const st={};
global.__a.querySelectorAll=sel=>{
  const m=/\[data-([a-z]+)\]/.exec(sel); if(!m) return [];
  const k='data-'+m[1], a={};
  a[k] = k==='data-dlshot'||k==='data-bio'||k==='data-biotxt' ? 's1' : 'x';
  a['data-name']='Marion Delacroix-Hale'; a['data-which']='short'; a['data-fn']='NACBA BIO.pdf';
  return [mkEl(a)];
};
global.document={getElementById:i=>(st[i]=st[i]||mkEl()),querySelectorAll:()=>[],
  querySelector:()=>null,createElement:()=>({set href(v){},set download(v){saved.push(v);},
    click(){},remove(){},style:{}}),body:{appendChild(){}}};
global.window={scrollTo(){},addEventListener(){},open:()=>null,prompt:()=>null};
global.location={href:'https://docket.nacba.org/'};
let store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=v;}};
global.setTimeout=()=>{}; global.clearTimeout=()=>{};
/* Node 24 exposes navigator as a getter-only global, so a plain
   global.navigator = {...} is silently dropped and the clipboard path never
   runs. Define it instead. URL, Blob and atob are Node's real ones on
   purpose: a fake Blob would not prove the bytes survive the round trip. */
Object.defineProperty(globalThis,'navigator',{configurable:true,
  value:{clipboard:{writeText:async t=>{copied.push(t);}}}});
vm.runInThisContext(s);

session={user:{email:'coordinator@example.org'}}; myEmail='coordinator@example.org';
myRole='admin'; team=[]; links={}; history=[]; roster=[{id:'s1',full_name:'Marion Delacroix-Hale'}];
spkCats={}; progCats={}; categories=[]; ideas=[]; ideaCats={}; metrics={}; progPeople={};
suggestions=[]; suggComments={};

// The speaker sent a bio and a headshot through the packet, plus two files.
// Nobody has ticked a single deliverable box.
bios={ s1:{ id:'s1', headshot_at:'2026-11-12T18:04:00Z', headshot_mime:'image/jpeg',
  bio:'Marion Delacroix-Hale is a consumer bankruptcy attorney in Atlanta. '.repeat(6),
  bio_short:'Marion Delacroix-Hale represents consumer debtors in Georgia.',
  bio_updated_at:'2026-11-12T18:11:00Z', bio_updated_by:'speaker',
  linkedin:'https://linkedin.com/in/example' } };
uploads={ ps1:[
  {id:'u1',program_speaker_id:'ps1',kind:'other',filename:'NACBA Speaker Agreement.pdf',
   size_bytes:204800,uploaded_at:'2026-11-12T18:20:00Z'},
  {id:'u2',program_speaker_id:'ps1',kind:'bio',filename:'NACBA BIO.pdf',
   size_bytes:51200,uploaded_at:'2026-11-12T18:18:00Z'} ] };
programs=[{id:'p1',slug:'x',event_date:'2026-12-10',archived:false,kind:'paid',
  title:'Student Loan Discharge',description:'d',note:'',venue:'',location:'',
  store_url:'',recording_url:'',
  program_speakers:[{id:'ps1',topic:'',confirmation:'confirmed',sort_order:0,
    speakers:{id:'s1',full_name:'Marion Delacroix-Hale',preferred_title:'',firm:'',
      address:'',email:'a@example.org',phone:'',pronunciation:'',headshot_location:'',
      bio_location:'',speaker_type:'debtor_attorney'},
    deliverables:[{id:'d1',item:'bio',received:false},{id:'d2',item:'headshot',received:false},
      {id:'d3',item:'agreement',received:false},{id:'d4',item:'outline',received:false},
      {id:'d5',item:'powerpoint',received:false}]}],
  tasks:[]}];

let fails=0;
const check=(l,t)=>{console.log(l);t.forEach(([n,f])=>{let ok=false;try{ok=f();}catch(e){ok=false;}
  if(!ok)fails++;console.log((ok?'    ok   ':'    FAIL ')+n);});};
const base={name:'detail',id:'p1',edit:false,editSpeaker:null,editRoster:false,creating:false,
  cat:null,stype:null,q:'',speakerId:null,istatus:null,editIdea:null,editStats:false};

// ---------- what submissions() reads ----------
const subs=submissions(programs[0].program_speakers[0]);
const by=id=>subs.find(x=>x.item===id);
check('read from the three stores, not the checkboxes:',[
 ['the headshot is seen though no box is ticked', ()=>!!by('headshot').at && !by('headshot').ticked],
 ['and it is known to be packet-written, not a file', ()=>by('headshot').text===true],
 ['the bio the speaker typed wins over the PDF', ()=>by('bio').text===true &&
    by('bio').at==='2026-11-12T18:11:00Z'],
 ['word counts are reported for both lengths', ()=>/\d+w short/.test(by('bio').how) &&
    /\d+w full/.test(by('bio').how)],
 ['the agreement is named by its filename, never asserted',
   ()=>by('agreement').how==='NACBA Speaker Agreement.pdf'],
 ['nothing is invented for the outline', ()=>by('outline').at===null],
 ['so does the PowerPoint stay empty', ()=>by('powerpoint').at===null],
]);

// ---------- what the page actually renders ----------
view={...base}; render();
const html=app.innerHTML;
check('the program page says it without a click:',[
 ['there is a submissions panel', ()=>/What speakers have sent/.test(html)],
 ['it counts what is in hand', ()=>/3 of 5 in hand/.test(html)],
 ['it flags the unternticked'.replace('tern','') , ()=>/untick/.test(html)],
 ['the headshot offers the image', ()=>/data-dlshot="s1"/.test(html)],
 ['both bio lengths can be copied', ()=>/data-bio="s1" data-which="short"/.test(html) &&
    /data-bio="s1" data-which="full"/.test(html)],
 ['the bio can be saved as text', ()=>/data-biotxt="s1"/.test(html)],
 ['the uploaded files are still downloadable', ()=>/data-dl="u1"/.test(html)],
 ['the manual grid marks what nobody ticked', ()=>/ev-mark/.test(html)],
 ['nothing rendered undefined', ()=>!/undefined/.test(html)],
]);

// ---------- new since last look ----------
check('new since you last looked:',[
 ['unseen work is badged', ()=>/chip-new/.test(html)],
 ['and can be cleared', ()=>/sub-seen/.test(html)],
 ['the season roll-up counts all three', ()=>newSubmissions(programs).length===3],
]);
store['nacba.seen.coordinator@example.org']='2026-11-13T00:00:00Z';
view={...base}; render();
check('once seen, it stops shouting:',[
 ['no NEW badges left', ()=>!/chip-new/.test(app.innerHTML)],
 ['nothing counted as new', ()=>newSubmissions(programs).length===0],
 ['but the submissions are still listed', ()=>/3 of 5 in hand/.test(app.innerHTML)],
]);
store={};

// ---------- the speaker's own page ----------
view={...base,name:'season',tab:'roster',id:null,speakerId:'s1'}; render();
const sp=app.innerHTML;
check('the speaker page can feed a promo graphic:',[
 ['it offers the headshot itself, not a note about where it lives',
   ()=>/Bio and headshot/.test(sp) && /data-dlshot="s1"/.test(sp)],
 ['it says when the headshot arrived', ()=>/on file/.test(sp)],
 ['both bio lengths are there with word counts',
   ()=>/data-bio="s1" data-which="full"/.test(sp) && /w short, \d+w full/.test(sp)],
 ['and who wrote it', ()=>/written by the speaker/.test(sp)],
 ['the LinkedIn link is offered when there is one', ()=>/linkedin\.com\/in\/example/.test(sp)],
 ['nothing rendered undefined', ()=>!/undefined/.test(sp)],
]);

// ---------- the season's front door ----------
view={...base,name:'season',tab:'upcoming',id:null,speakerId:null}; render();
const sh=app.innerHTML;
check('the season says it without opening a program:',[
 ['arrivals are listed', ()=>/new submissions since you last looked/.test(sh)],
 ['the headshot can be pulled from there', ()=>/data-dlshot="s1"/.test(sh)],
 ['each one offers a way into its program', ()=>/data-open="p1"/.test(sh)],
 ['and the whole lot can be cleared', ()=>/inbox-seen/.test(sh)],
]);

// ---------- what is outstanding, and when that starts counting ----------
check('the package is not outstanding before it is due:',[
 ['nothing counted 60 days out', ()=>{
    const p=JSON.parse(JSON.stringify(programs[0])); p.event_date='2027-06-01';
    return packageGap(p)===0; }],
 ['past T\u221221 the untouched items count', ()=>{
    const p=JSON.parse(JSON.stringify(programs[0])); p.event_date='2026-11-20';
    p.program_speakers[0].deliverables.forEach(d=>{d.received=false;});
    // bio, headshot and agreement are in; outline and PowerPoint are not
    return packageGap(p)===2; }],
 ['an item that arrived is not outstanding, ticked or not', ()=>{
    const p=JSON.parse(JSON.stringify(programs[0])); p.event_date='2026-11-20';
    return !submissions(p.program_speakers[0])
      .filter(x=>x.delivId && !x.at && !x.ticked).some(x=>x.item==='headshot'); }],
 ['and it reaches the roll-up in words', ()=>{
    const p=JSON.parse(JSON.stringify(programs[0])); p.event_date='2026-11-20';
    return alertRollup([p]).some(t=>/package items outstanding/.test(t)); }],
]);

// ---------- the buttons do something ----------
view={...base}; render(); wire();
const fire=async k=>{const h=handlers.filter(x=>x.attrs[k]!==null&&x.attrs[k]!==undefined);
  for(const x of h) await x.fn(x.attrs&&mkEl(x.attrs)||null, {});};
(async()=>{
  rpcCalls.length=0; saved.length=0; copied.length=0;
  const hs=handlers.filter(h=>h.attrs['data-dlshot']);
  for(const h of hs) await h.fn();
  const bс=handlers.filter(h=>h.attrs['data-bio']);
  for(const h of bс) await h.fn();
  const bt=handlers.filter(h=>h.attrs['data-biotxt']);
  for(const h of bt) await h.fn();

  check('clicking them reaches the database and the disk:',[
   ['the headshot is fetched through speaker_headshot',
     ()=>rpcCalls.some(c=>c.name==='speaker_headshot' && c.args.sid==='s1')],
   ['the image is saved under the speaker’s name',
     ()=>saved.some(f=>/^Marion-Delacroix-Hale-headshot\.jpg$/.test(f))],
   ['the bio reaches the clipboard', ()=>copied.length>0],
   ['the short bio is the short one',
     ()=>copied.some(t=>/represents consumer debtors/.test(t) && t.length<300)],
   ['the .txt carries both lengths and who wrote it',
     ()=>saved.some(f=>/-bio\.txt$/.test(f)) &&
         /SHORT BIO/.test(bioText('s1','both')) && /FULL BIO/.test(bioText('s1','both')) &&
         /by the speaker/.test(bioText('s1','both'))],
   ['a bio that does not exist is refused, not faked', ()=>bioText('s2','short')===''],
  ]);

  // ---------- the change log stops swallowing files ----------
  const mig=fs.readFileSync(path.join(__dirname,'..','supabase','migrations',
    '20261114000100_log_no_bytes.sql'),'utf8');
  check('the change log no longer stores the file bytes:',[
   ['both bytea columns are named as noise',
     ()=>/'headshot','name_audio'/.test(mig.replace(/\s+/g,''))],
   ['the readable companion columns are left alone',
     ()=>!/'headshot_at'/.test(mig.split('-- ---------- 3.')[0]) &&
         !/'name_audio_at'/.test(mig.split('-- ---------- 3.')[0])],
   ['the rows already written are cleaned up', ()=>/update change_log/.test(mig)],
   ['matched on size too, so re-running is a no-op',
     ()=>/length\(old_value\),0\) > 200/.test(mig)],
   ['the audit rows are blanked, never deleted', ()=>!/delete\s+from\s+change_log/i.test(mig)],
   ['it ends in SELECTs, because the SQL editor shows no notices', ()=>{
      // the prose explains why RAISE NOTICE is avoided, so judge the SQL only
      const code=mig.split('\n').filter(l=>!/^\s*--/.test(l)).join('\n');
      return !/raise\s+notice/i.test(code) && /select/i.test(code.slice(-600)); }],
   ['it checks the headshots themselves survived', ()=>/count\(headshot\)/.test(mig)],
   ['the history screen names the companion column in words',
     ()=>FIELD_NAMES.headshot_at==='headshot' && FIELD_NAMES.bio==='biography'],
  ]);

  // ---------- the bytes are never in a list query ----------
  const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const sel=(src.match(/\.select\([^)]*\)/g)||[]).join(' ');
  check('the 10 MB column stays out of the page load:',[
   ['no select asks for the headshot bytes', ()=>!/\bheadshot\b(?!_)/.test(sel)],
   ['presence is read from the timestamp instead', ()=>/headshot_at/.test(sel)],
  ]);

  console.log(fails? '\n'+fails+' FAILED' : '\nall passed');
  process.exit(fails?1:0);
})();
