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
  const k='data-'+m[1];const a={};a[k]=k==='data-speaker'?'s1':'x';return[mkEl(a)];};
global.document={getElementById:i=>(st[i]=st[i]||mkEl()),querySelectorAll:()=>[],
  querySelector:()=>null,createElement:mkEl,body:{appendChild(){}}};
global.window={scrollTo(){},addEventListener(){},open:()=>null};
global.location={href:'https://x/'}; global.localStorage={getItem:()=>null,setItem(){}};
global.setTimeout=(f)=>{}; global.clearTimeout=()=>{}; global.navigator={clipboard:{}};
vm.runInThisContext(s);

session={user:{email:'t@x.com'}}; myRole='admin'; team=[]; links={}; uploads={}; history=[];
categories=[{id:'c1',name:'Student Loans'},{id:'c2',name:'Chapter 13'}];
spkCats={s1:['c1']}; progCats={};
roster=[
 {id:'s1',full_name:'Jenny L. Doling, Esq.',preferred_title:'',firm:'JDL Law',
  email:'jd@jdl.law',phone:'',pronunciation:'',speaker_type:'debtor_attorney',name_audio_at:'2026-08-15T10:00:00Z'},
 {id:'s2',full_name:'Hon. Pat Ellery',preferred_title:'Judge',firm:'Court',
  email:'p@court.gov',phone:'',pronunciation:'',speaker_type:'judge'}];
const spk=id=>({id,full_name:roster.find(r=>r.id===id).full_name});
programs=[
 {id:'p1',event_date:'2026-10-22',kind:'paid',archived:false,title:'SLAP in a Nutshell',
  description:'d',note:'',venue:'',location:'',store_url:'',recording_url:'',
  program_speakers:[{id:'ps1',topic:'Workflows',confirmation:'confirmed',sort_order:0,
    speakers:{...spk('s1'),preferred_title:'',firm:'JDL',address:'',email:'jd@jdl.law',phone:'',
      pronunciation:'',headshot_location:'',bio_location:'',speaker_type:'debtor_attorney'},
    deliverables:[]}],tasks:[]},
 {id:'p2',event_date:'2023-05-11',kind:'conference',archived:true,title:'Cramdowns Live',
  description:'',note:'',venue:'JW Marriott',location:'Palm Desert, CA',
  store_url:'https://nacba.com/store/cramdowns',recording_url:'',
  program_speakers:[{id:'ps2',topic:'',confirmation:'confirmed',sort_order:0,
    speakers:{...spk('s1'),preferred_title:'',firm:'JDL',address:'',email:'jd@jdl.law',phone:'',
      pronunciation:'',headshot_location:'',bio_location:'',speaker_type:'debtor_attorney'},
    deliverables:[]}],tasks:[]}];

let fails=0;
function check(label, tests){
  console.log(label);
  tests.forEach(([n,fn])=>{ let ok=false; try{ ok=fn(); }catch(e){}
    if(!ok) fails++; console.log((ok?'    ok   ':'    FAIL ')+n); });
}
const base={name:'season',id:null,edit:false,editSpeaker:null,creating:false,
            cat:null,stype:null,q:'',speakerId:null};

view={...base,tab:'roster'}; render(); let h=global.__a.innerHTML;
check('roster:',[
 ['Speakers button in header', ()=>h.includes('id="roster-btn"')],
 ['both speakers listed', ()=>h.includes('Jenny L. Doling')&&h.includes('Hon. Pat Ellery')],
 ['program counts shown', ()=>h.includes('2 programs')&&h.includes('0 programs')],
 ['topic tags render', ()=>h.includes('Student Loans')],
 ['category + type filters', ()=>h.includes('data-rcat=')&&h.includes('data-rtype=')],
]);

view={...base,tab:'roster',stype:'judge'}; render(); h=global.__a.innerHTML;
check('filtered to judges:',[
 ['judge kept', ()=>h.includes('Hon. Pat Ellery')],
 ['others excluded', ()=>!h.includes('Jenny L. Doling')],
]);

view={...base,tab:'roster',speakerId:'s1'}; render(); h=global.__a.innerHTML;
check('speaker detail:',[
 ['both programs listed', ()=>h.includes('SLAP in a Nutshell')&&h.includes('Cramdowns Live')],
 ['newest first', ()=>h.indexOf('SLAP in a Nutshell')<h.indexOf('Cramdowns Live')],
 ['in-person location shown', ()=>h.includes('Palm Desert, CA')],
 ['store link present', ()=>h.includes('nacba.com/store/cramdowns')],
 ['topic chips editable', ()=>h.includes('data-cat="speaker"')],
]);

view={...base,tab:'catalog'}; render(); h=global.__a.innerHTML;
check('catalogue tab:',[
 ['archived program shown', ()=>h.includes('Cramdowns Live')],
 ['live program excluded', ()=>!h.includes('SLAP in a Nutshell')],
]);
view={...base,tab:'all'}; render(); h=global.__a.innerHTML;
check('season view:',[
 ['live program shown', ()=>h.includes('SLAP in a Nutshell')],
 ['archived kept out', ()=>!h.includes('Cramdowns Live')],
]);
view={...base,tab:'upcoming',creating:true}; render(); h=global.__a.innerHTML;
check('new program form:',[
 ['catalogue checkbox', ()=>h.includes('id="np-archived"')],
 ['store link field', ()=>h.includes('id="np-store"')],
 ['venue + location', ()=>h.includes('id="np-venue"')&&h.includes('id="np-loc"')],
 // 'Conference session' was retired on 2 Nov 2026 in favour of NACBA's own
 // types. The form must offer the replacements and must not offer the
 // retired ones -- asserted inside the <select>, since program cards print
 // type labels too.
 ['in-person types offered', ()=>{
    const m=/<select id="np-kind">([\s\S]*?)<\/select>/.exec(h);
    return !!m && m[1].includes('Annual Convention \u2013 Breakout Session')
               && m[1].includes('Members-Only Workshop \u2013 Session'); }],
 ['retired types not offered', ()=>{
    const m=/<select id="np-kind">([\s\S]*?)<\/select>/.exec(h);
    return !!m && !m[1].includes('value="conference"')
               && !m[1].includes('value="workshop"'); }],
]);

// ---- editing a speaker from their own page ----
view={...base,tab:'roster',speakerId:'s1'}; render(); h=global.__a.innerHTML;
check('speaker page, read mode:',[
 ['Edit details button', ()=>h.includes('id="rs-edit"')],
 ['no form fields yet', ()=>!h.includes('id="rs-name"')],
 ['contact shown', ()=>h.includes('JDL Law')],
]);

view={...base,tab:'roster',speakerId:'s1',editRoster:true}; render(); h=global.__a.innerHTML;
check('speaker page, edit mode:',[
 ['name prefilled', ()=>/id="rs-name" value="Jenny L. Doling, Esq."/.test(h)],
 ['type preselected', ()=>/value="debtor_attorney" selected/.test(h)],
 ['firm, email, phone', ()=>['rs-firm','rs-email','rs-phone'].every(i=>h.includes('id="'+i+'"'))],
 ['address + pronunciation', ()=>h.includes('id="rs-addr"')&&h.includes('id="rs-say"')],
 ['headshot + bio location', ()=>h.includes('id="rs-head"')&&h.includes('id="rs-bio"')],
 ['notes textarea', ()=>h.includes('id="rs-notes"')],
 ['save and cancel', ()=>h.includes('id="rs-save"')&&h.includes('id="rs-cancel"')],
 ['delete blocked — has programs', ()=>!h.includes('id="rs-del"')&&h.includes('remove them first')],
]);

// a speaker with no programs may be deleted
view={...base,tab:'roster',speakerId:'s2',editRoster:true}; render(); h=global.__a.innerHTML;
check('speaker with no programs:',[
 ['delete offered', ()=>h.includes('id="rs-del"')],
 ['judge type preselected', ()=>/value="judge" selected/.test(h)],
]);

view={...base,tab:'roster'}; render(); h=global.__a.innerHTML;
check('roster:',[
 ['add-a-speaker box', ()=>h.includes('id="rs-new"')&&h.includes('id="rs-add"')],
]);


// ---- spoken name ----
view={...base,tab:'roster'}; render(); h=global.__a.innerHTML;
check('roster, spoken name:',[
 ['badge on the one with audio', ()=>h.includes('&#x25B8; name')||h.includes('▸ name')],
 ['not on the one without', ()=>(h.match(/▸ name/g)||[]).length===1],
]);
view={...base,tab:'roster',speakerId:'s1'}; render(); h=global.__a.innerHTML;
check('speaker page:',[
 ['hear button present', ()=>h.includes('data-hear="s1"')],
]);
view={...base,tab:'roster',speakerId:'s2'}; render(); h=global.__a.innerHTML;
check('speaker with no recording:',[
 ['no hear button', ()=>!h.includes('data-hear=')],
]);


// ---- navigation ----
view={...base,tab:'upcoming'}; render(); h=global.__a.innerHTML;
check('navigation, on Programs:',[
 ['Programs button present', ()=>h.includes('id="programs-btn"')],
 ['marked as current', ()=>/id="programs-btn" aria-current="page"|class="btn is-here" id="programs-btn"/.test(h)],
 ['Speakers and Team present', ()=>h.includes('id="roster-btn"')&&h.includes('id="team-btn"')],
 ['History out of the header', ()=>h.indexOf('id="hist-all"')>h.indexOf('<footer')],
 ['History in the footer', ()=>h.includes('Change history')],
 ['footer counts programs', ()=>/\d+ live · \d+ in the catalogue/.test(h)],
]);
view={...base,tab:'roster'}; render(); h=global.__a.innerHTML;
check('on Speakers:',[
 ['Speakers marked current', ()=>/is-here" id="roster-btn"|id="roster-btn" aria-current/.test(h)],
 ['Programs not current', ()=>!/is-here" id="programs-btn"/.test(h)],
 ['Programs still reachable', ()=>h.includes('id="programs-btn"')],
]);
view={...base,tab:'roster',speakerId:'s1'}; render(); h=global.__a.innerHTML;
check('deep in a speaker page:',[
 ['Programs button still there', ()=>h.includes('id="programs-btn"')],
]);


// ---- dates and spelling ----
view={...base,tab:'all'}; render(); h=global.__a.innerHTML;
check('program tiles:',[
 ['tile date carries the year', ()=>/class="card-date">[^<]*2026/.test(h)],
 ['tile shows weekday and month too', ()=>/class="card-date">\w{3}, \w{3} \d{1,2}, 2026/.test(h)],
]);
view={...base,tab:'catalog'}; render(); h=global.__a.innerHTML;
check('catalogue tiles:',[
 ['older year shown, not assumed', ()=>/class="card-date">[^<]*2023/.test(h)],
]);
view={...base,tab:'ideas'}; render(); h=global.__a.innerHTML;
check('spelling:',[
 ['Program, not Programme', ()=>h.includes('Program ideas')&&!/Programme/.test(h)],
]);

process.exit(fails?1:0);
