// Program types — the eleven NACBA actually runs, requested 26 Oct 2026.
//
// Why this test exists: the type list drives two dropdowns and a label
// function, and a retired type must stay reachable for a program already set
// to it while never being offered for a new one. The obvious assertion --
// "does the label appear in the HTML" -- passes even when the dropdown is
// empty, because program cards print the label too. So every assertion here
// looks *inside* the <select>.
const fs=require('fs'),vm=require('vm');
let s=fs.readFileSync(__dirname+'/../index.html','utf8')
 .split('<script type="module">')[1].split('</script>')[0];
s=s.replace(/^import .*$/m,'')
   .replace(/^const sb =.*$/m,'var sb={auth:{onAuthStateChange(){},getSession:async()=>({data:{}})}};')
   .replace(/^const app = .*$/m,'var app=global.__a;')
   .replace(/^const /gm,'var ').replace(/^let /gm,'var ');
const mkEl=(attrs={})=>({innerHTML:'',textContent:'',className:'',value:'',hidden:true,
  classList:{contains:()=>false},getAttribute:k=>attrs[k]??null,
  addEventListener:()=>{},querySelectorAll:()=>[],scrollIntoView(){},focus(){},remove(){}});
global.__a=mkEl(); const st={};
global.__a.querySelectorAll=sel=>{const m=/\[data-([a-z]+)\]/.exec(sel);
  if(!m)return[]; const a={}; a['data-'+m[1]]='x'; return[mkEl(a)];};
global.document={getElementById:i=>(st[i]=st[i]||mkEl()),querySelectorAll:()=>[],
  querySelector:()=>null,createElement:mkEl,body:{appendChild(){}}};
global.window={scrollTo(){},addEventListener(){},open:()=>null};
global.location={href:'https://docket.nacba.org/'};
global.localStorage={getItem:()=>null,setItem(){}};
global.setTimeout=()=>{}; global.navigator={clipboard:{}}; global.confirm=()=>true;
vm.runInThisContext(s);

let fails=0;
const ok=(n,c)=>{console.log((c?'    ok   ':'    FAIL ')+n); if(!c)fails++;};

// Pull out one <select> by id, so assertions cannot be satisfied by the
// rest of the page.
const sel=(h,id)=>{
  const m=new RegExp('<select id="'+id+'">([\\s\\S]*?)</select>').exec(h);
  return m?m[1]:'';
};
const opts=body=>[...body.matchAll(/<option value="([a-z_]+)"/g)].map(m=>m[1]);

const WANTED=[
  ['paid','Webinar – CLE'],
  ['webinar_nocle','Webinar – Non-CLE'],
  ['vendor','Sponsored Webinar / Vendor Program'],
  ['marketing_minute','BK Marketing Minute'],
  ['bk_talk','BK Talk'],
  ['convention_breakout','Annual Convention – Breakout Session'],
  ['convention_plenary','Annual Convention – Plenary Session'],
  ['workshop_members','Members-Only Workshop – Session'],
  ['workshop_virtual','Virtual Workshop – Session'],
  ['workshop_preconvention','Pre-Convention Workshop'],
  ['board_event','Board Meeting / Special Event']
];

const base=()=>{ programs=[]; categories=[]; progCats={}; spkCats={}; links={};
  uploads={}; history=[]; team=[]; myRole='admin';
  session={user:{email:'tara@salinaslawgroup.com'}}; };

function draw(v){ base();
  view=Object.assign({name:'season',tab:'all',id:null,cat:null,edit:false,
    editSpeaker:null,creating:false},v);
  if(v.progs){ programs=v.progs; progCats={p1:[]}; }
  try{ render(); return global.__a.innerHTML; }
  catch(e){ console.log('    THROW -> '+e.message); fails++; return ''; }
}

console.log('new program form:');
let body=sel(draw({creating:true}),'np-kind');
ok('dropdown is rendered at all', body.length>0);
let ids=opts(body);
WANTED.forEach(([id,label])=>ok('offers '+label,
  body.includes('value="'+id+'"') && body.includes(label)));
ok('all eleven present, in Rachael\'s order',
  JSON.stringify(ids)===JSON.stringify(WANTED.map(w=>w[0])));
ok('does NOT offer retired "conference"', !ids.includes('conference'));
ok('does NOT offer retired "workshop"',   !ids.includes('workshop'));
ok('CLE webinar is the default (first)',  ids[0]==='paid');

// Same shape the app actually receives: program_speakers, not speakers.
const prog=k=>[{id:'p1',slug:'s',event_date:'2027-03-04',title:'T',
  description:'d',note:'',kind:k,archived:false,venue:'',location:'',
  store_url:'',recording_url:'',program_speakers:[],tasks:[]}];

console.log('\nediting a program already set to a retired type:');
body=sel(draw({name:'detail',id:'p1',edit:true,progs:prog('workshop')}),'ep-kind');
ids=opts(body);
ok('dropdown is rendered', body.length>0);
ok('its own retired type is still offered', ids.includes('workshop'));
ok('and is the selected one', /value="workshop"\s+selected/.test(body));
ok('the other retired type is not offered', !ids.includes('conference'));
ok('twelve options: the eleven plus its own', ids.length===12);

console.log('\nediting an ordinary program:');
body=sel(draw({name:'detail',id:'p1',edit:true,progs:prog('vendor')}),'ep-kind');
ids=opts(body);
ok('no retired types offered', !ids.includes('workshop')&&!ids.includes('conference'));
ok('exactly eleven options', ids.length===11);
ok('vendor is selected', /value="vendor"\s+selected/.test(body));

console.log('\nlabels and in-person logic:');
ok('kindLabel maps a new type', kindLabel('board_event')==='Board Meeting / Special Event');
ok('kindLabel still maps the default', kindLabel('paid')==='Webinar – CLE');
ok('kindLabel copes with null', kindLabel(null)==='Webinar – CLE');
ok('convention sessions are in person', IN_PERSON('convention_breakout')&&IN_PERSON('convention_plenary'));
ok('a VIRTUAL workshop is not in person', !IN_PERSON('workshop_virtual'));
ok('a members-only workshop is', IN_PERSON('workshop_members'));
ok('a webinar is not', !IN_PERSON('paid')&&!IN_PERSON('webinar_nocle'));

console.log(fails?'\n'+fails+' FAILED':'\nall passed');
process.exit(fails?1:0);
