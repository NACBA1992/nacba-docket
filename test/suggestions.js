// Suggestions, and the build plan they feed.
//
// Why this test exists. The feature is small but it has three ways to fail
// quietly, and none of them look like a crash:
//
//   1. THE LIST IS WRITTEN TWICE. SUGG_STATUS and SUGG_AREAS in index.html
//      decide what the dropdowns offer; the CHECK constraints in
//      20261102000500_suggestions.sql decide what the database accepts. If
//      they drift, the UI offers a value that is rejected on save and the
//      only symptom is a toast. So this test reads the migration and
//      compares the two, in both directions.
//   2. A RENDER TEST CANNOT SEE MISSING DATA. Every assertion below would
//      pass just as happily if loadData never asked for the suggestions
//      table, because an empty list and a list that was never fetched draw
//      identically. The grep block is what catches that.
//   3. SUGGESTIONS AND PROGRAM IDEAS MUST STAY APART. They are different
//      tables with different shapes, and the whole point of the separate
//      table is that the Ideas tab keeps being a list of webinars. So the
//      last block asserts neither screen shows the other's rows.
const fs=require('fs'),vm=require('vm');
const SRC=fs.readFileSync(__dirname+'/../index.html','utf8');
const MIG=fs.readFileSync(
  __dirname+'/../supabase/migrations/20261102000500_suggestions.sql','utf8');
let s=SRC.split('<script type="module">')[1].split('</script>')[0];
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

// Invented addresses on purpose: this repo is public, so no real person's
// email belongs in a committed fixture.
const TEAM=[
  {email:'chair@example.org', role:'emc_chair', full_name:'Charlie Chair',   title:'EMC Chair'},
  {email:'promo@example.org', role:'marketing', full_name:'Pat Promotion',   title:'Marketing'}
];

const SUGGS=()=>[
  {id:'s1',title:'Send the invitation from the portal',
   detail:'The branded email already exists and stops one step short of sending.',
   area:'portal',status:'planned',submitted_by:'build plan',
   decided_note:'Needs the two IT requests first.',
   created_at:'2026-11-02T00:00:00Z',updated_at:'2026-11-02T00:00:00Z'},
  {id:'s2',title:'The Run of Show template',
   detail:'Checklist 5.1 requires one. It does not exist.',
   area:'documents',status:'new',submitted_by:'chair@example.org',decided_note:'',
   created_at:'2026-11-02T00:00:00Z',updated_at:'2026-11-02T00:00:00Z'},
  {id:'s3',title:'Post the docket to the public website',
   detail:'',area:'other',status:'declined',submitted_by:'promo@example.org',
   decided_note:'It carries speaker phone numbers.',
   created_at:'2026-11-02T00:00:00Z',updated_at:'2026-11-02T00:00:00Z'}
];

const IDEAS=()=>[
  {id:'i1',title:'Means test after the 2026 amendments',description:'',rationale:'',
   speakers_idea:'',target_period:'',status:'idea',source:'',suggested_by:'',
   program_id:null,created_at:'2026-11-02T00:00:00Z',updated_at:'2026-11-02T00:00:00Z'}
];

function draw(v){
  programs=[]; categories=[]; progCats={}; spkCats={}; links={};
  uploads={}; history=[]; metrics={}; runSheet={}; progPeople={};
  ideas=v.ideas!==undefined?v.ideas:IDEAS(); ideaCats={};
  team=TEAM; myRole='admin'; myEmail='';
  suggestions=v.suggs!==undefined?v.suggs:SUGGS();
  session={user:{email:'chair@example.org'}};
  view=Object.assign({name:'season',tab:'suggestions',id:null,cat:null,edit:false,
    editSpeaker:null,creating:false,editStats:false,sstatus:null,editSugg:null},v);
  try{ render(); return global.__a.innerHTML; }
  catch(e){ console.log('    THROW -> '+e.message); fails++; return ''; }
}

const byId=(h,id)=>{const m=new RegExp('<select id="'+id+'">([\\s\\S]*?)</select>').exec(h);
  return m?m[1]:'';};
const statusSel=(h,id)=>{
  const m=new RegExp('<select data-sstatus="'+id+'"[^>]*>([\\s\\S]*?)</select>').exec(h);
  return m?m[1]:'';};
const vals=b=>[...b.matchAll(/<option value="([^"]*)"/g)].map(m=>m[1]);
const selected=b=>{const m=/<option value="([^"]*)" selected>/.exec(b);return m?m[1]:null;};
const checkVals=col=>{
  const m=new RegExp('check \\('+col+' in \\(([^)]*)\\)').exec(MIG);
  return m?[...m[1].matchAll(/'([^']+)'/g)].map(x=>x[1]):[];};

// ---------------------------------------------------------------
console.log('the list of statuses is written twice, so compare them:');
const sqlStatus=checkVals('status'), sqlArea=checkVals('area');
ok('the migration actually declares a status constraint', sqlStatus.length>0);
ok('the migration actually declares an area constraint',  sqlArea.length>0);
ok('every status the UI offers, the database accepts',
  SUGG_STATUS.every(o=>sqlStatus.includes(o.id)));
ok('every status the database accepts, the UI offers',
  sqlStatus.every(v=>SUGG_STATUS.some(o=>o.id===v)));
ok('every area the UI offers, the database accepts',
  SUGG_AREAS.every(o=>sqlArea.includes(o.id)));
ok('every area the database accepts, the UI offers',
  sqlArea.every(v=>SUGG_AREAS.some(o=>o.id===v)));
ok('the default status is one of them', sqlStatus.includes('new'));
ok('ids are lower case, like every other id in the schema',
  SUGG_STATUS.every(o=>o.id===o.id.toLowerCase()) &&
  SUGG_AREAS.every(o=>o.id===o.id.toLowerCase()));

console.log('the screen draws:');
let h=draw({});
ok('an open item is listed', h.includes('Send the invitation from the portal'));
ok('its detail is shown', h.includes('stops one step short of sending'));
ok('a second open item is listed', h.includes('The Run of Show template'));
ok('a declined item is hidden by default', !h.includes('Post the docket to the public website'));
ok('the note saying where it stands is shown',
  h.includes('Where it stands') && h.includes('Needs the two IT requests first'));
ok('the area is shown as text, not only as a dropdown', h.includes('The portal'));
ok('the status is shown as text too, so it survives printing', h.includes('>Planned<'));

console.log('naming the person who asked:');
ok('a team member shows as their full name', h.includes('Charlie Chair'));
ok('a seeded plan item keeps its own label', h.includes('build plan'));
ok('nobody is ever "undefined"', !/suggested by\s*<\/div>/.test(h) && !h.includes('undefined'));

console.log('the status dropdown:');
const sel1=statusSel(h,'s1');
ok('every status is offered', SUGG_STATUS.every(o=>vals(sel1).includes(o.id)));
ok('the current one is selected', selected(sel1)==='planned');
ok('a different row shows its own status', selected(statusSel(h,'s2'))==='new');

console.log('filtering, which is how you read it as a plan:');
const hd=draw({sstatus:'declined'});
ok('asking for declined shows the declined one',
  hd.includes('Post the docket to the public website'));
ok('and says why it was declined', hd.includes('It carries speaker phone numbers'));
ok('asking for declined hides the planned one',
  !hd.includes('Send the invitation from the portal'));
ok('there is a way back to the open items', hd.includes('data-sstat=""'));
ok('each status chip carries a count', /data-sstat="planned"[^>]*>[\s\S]{0,40}1</.test(h));
ok('an empty list says so rather than drawing nothing',
  draw({suggs:[]}).includes('Nothing here yet'));

console.log('adding one, which is the whole point:');
ok('there is a title field', h.includes('id="ns-title"'));
ok('there is a detail field', h.includes('id="ns-detail"'));
ok('there is an area picker', h.includes('id="ns-area"'));
ok('the area picker offers every area',
  SUGG_AREAS.every(a=>vals(byId(h,'ns-area')).includes(a.id)));
ok('and a button to add it', h.includes('id="ns-add"'));
// The ids the form writes must be the ids addSuggestion reads. Two places.
const addFn=SRC.slice(SRC.indexOf('async function addSuggestion'),
                      SRC.indexOf('async function saveSuggestion'));
ok('addSuggestion reads exactly those three ids',
  addFn.includes('"ns-title"') && addFn.includes('"ns-detail"') && addFn.includes('"ns-area"'));
ok('addSuggestion refuses a blank title', addFn.includes('if (!t)'));

console.log('editing one:');
ok('no edit form until a row is being edited', !h.includes('id="se-title"'));
const he=draw({editSugg:'s1'});
ok('the edit form appears for that row', he.includes('id="se-title"'));
ok('it carries the title', he.includes('value="Send the invitation from the portal"'));
ok('it can set where things stand', he.includes('id="se-note"'));
ok('its area picker preselects the current area',
  selected(byId(he,'se-area'))==='portal');
const saveFn=SRC.slice(SRC.indexOf('async function saveSuggestion'),
                       SRC.indexOf('const setSuggestionStatus'));
ok('saveSuggestion reads exactly the ids the edit form writes',
  saveFn.includes('"se-title"') && saveFn.includes('"se-detail"') &&
  saveFn.includes('"se-area"') && saveFn.includes('"se-note"'));

console.log('suggestions and program ideas stay apart:');
ok('the suggestions screen does not list an idea',
  !h.includes('Means test after the 2026 amendments'));
const hi=draw({tab:'ideas'});
ok('the ideas screen lists the idea', hi.includes('Means test after the 2026 amendments'));
ok('the ideas screen does not list a suggestion',
  !hi.includes('Send the invitation from the portal'));
ok('the screen says where program ideas belong', h.includes('belong in Ideas instead'));

// ---------------------------------------------------------------
// Everything above would pass if the data never arrived, or if nothing was
// ever written back. These read index.html directly.
console.log('the data is actually asked for, and actually written:');
ok('loadData queries the table', /sb\.from\("suggestions"\)\.select/.test(SRC));
ok('a missing table degrades quietly instead of blanking the portal',
  /suggestions = sgRes\.error \? \[\] :/.test(SRC));
// Matched as "sgRes is somewhere in the binding list" rather than as the exact
// line: every new query in loadData adds a name after it, and an assertion that
// breaks each time one is added teaches people to edit the test, not read it.
ok('the result is destructured, not dropped',
  /const \[[^\]]*\bsgRes\b[^\]]*\] = await Promise\.all\(/.test(SRC));
ok('adding writes an insert', /sb\.from\("suggestions"\)\.insert/.test(SRC));
ok('editing writes an update', /sb\.from\("suggestions"\)\.update\(\{\s*\n?\s*title:/.test(SRC));
ok('changing status writes an update', /update\(\{ status \}\)\.eq\("id", id\)/.test(SRC));
ok('deleting writes a delete', /sb\.from\("suggestions"\)\.delete\(\)/.test(SRC));

console.log('the controls are wired to something:');
ok('the filter chips are wired',   /on\("\[data-sstat\]"/.test(SRC));
ok('the status dropdown is wired', /on\("\[data-sstatus\]"/.test(SRC));
ok('the edit button is wired',     /on\("\[data-sedit\]"/.test(SRC));
ok('the delete button is wired',   /on\("\[data-sdel\]"/.test(SRC));
ok('delete asks first', /Delete the suggestion/.test(SRC));
ok('the add button is wired',  /getElementById\("ns-add"\)\?\.addEventListener/.test(SRC));
ok('save is wired',           /getElementById\("se-save"\)\?\.addEventListener/.test(SRC));
ok('cancel is wired',         /getElementById\("se-cancel"\)\?\.addEventListener/.test(SRC));
ok('there is a way to reach the screen',
  /nav\("sugg-btn","Suggestions"/.test(SRC) &&
  /getElementById\("sugg-btn"\)\?\.addEventListener/.test(SRC));
ok('the router knows the tab', /view\.tab==="suggestions"\) return renderSuggestions/.test(SRC));
ok('Programs stops looking selected on this tab', /"assign","suggestions"\]/.test(SRC));

console.log('the migration itself:');
ok('the change log is taught about this table, or labels log blank',
  /tg_table_name = 'suggestions' then/.test(MIG) && /lbl := cur ->> 'title'/.test(MIG));
ok('every pre-existing log_changes branch is carried over',
  /'program_ideas','program_metrics'/.test(MIG) && /tg_table_name = 'programs'/.test(MIG) &&
  /tg_table_name = 'program_speakers'/.test(MIG));
ok('the seed only runs on an empty table, so re-running cannot duplicate',
  /if not exists \(select 1 from suggestions\) then/.test(MIG));
ok('row level security is on', /alter table suggestions enable row level security/.test(MIG));
ok('it uses the house is_allowed\(\) policy, not a new rule',
  /using \(public\.is_allowed\(\)\)/.test(MIG));
ok('the submitter is stamped from the session, not trusted from the client',
  /auth\.jwt\(\) ->> 'email'/.test(MIG));
ok('it ends in SELECTs, because the SQL editor shows no notices',
  !/raise notice/i.test(MIG) && /did it work/.test(MIG));

console.log(fails?('  '+fails+' FAILED'):'all passed');
process.exit(fails?1:0);
