// Task assignment — who owes a task, and who holds each role on a program.
//
// Why this test exists: before this, `tasks.owner_role` held a role NAME
// copied from the template and was compared to nobody. The feature has three
// moving parts that have to agree -- the people on a program, an inheritance
// rule, and a per-task override -- and the override must survive a change of
// coordinator. The traps:
//
//   1. The inheritance rule is written TWICE: inherit_assignee in SQL, for
//      the triggers, and inheritedAssignee in JS, for releasing a task back
//      to the program's people. They can drift apart silently.
//   2. A render test cannot see whether the data ever arrives. Every
//      assertion about a dropdown would still pass if loadData never asked
//      for program_people, because the markup looks identical when the field
//      is simply undefined -- everything reads "nobody". The last block
//      greps index.html for the query, the writes and the wiring.
//   3. The people started life as two columns on `programs` and are now a
//      table keyed on role. Anything still reading p.coordinator_email would
//      quietly return undefined rather than fail, so the fixture deliberately
//      does NOT carry those columns.
const fs=require('fs'),vm=require('vm');
const SRC=fs.readFileSync(__dirname+'/../index.html','utf8');
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
  {email:'coord@example.org', role:'coordinator', full_name:'Casey Coordinator', title:'Coordinator'},
  {email:'mod@example.org',   role:'moderator',   full_name:'Morgan Moderator',   title:'Moderator'},
  {email:'promo@example.org', role:'marketing',   full_name:'Pat Promotion',      title:'Marketing'},
  {email:'chair@example.org', role:'emc_chair',   full_name:'Charlie Chair',      title:'EMC Chair'}
];

const TASKS=()=>[
  {id:'t1',offset_days:-35,seq:0,task:'Agreements on file',owner_role:'Coordinator',
   source_ref:'§2.1',is_gate:true,gate_key:'agreements',done:false,done_by:'',
   assignee_email:'coord@example.org',assignee_set:false},
  {id:'t2',offset_days:0,seq:1,task:'Open 30 minutes early',owner_role:'Moderator',
   source_ref:'§6.4',is_gate:true,gate_key:'',done:false,done_by:'',
   assignee_email:'mod@example.org',assignee_set:false},
  {id:'t3',offset_days:-7,seq:1,task:'Reminder email one',owner_role:'Coordinator',
   source_ref:'§1.2',is_gate:false,gate_key:'',done:false,done_by:'',
   assignee_email:'chair@example.org',assignee_set:true}
];

// No coordinator_email / moderator_email here: those columns are gone from
// the query, and a fixture that still carried them would hide a regression.
const mkProg=(id,date,over={})=>Object.assign({
  id,slug:id,event_date:date,title:'Program '+id,description:'d',note:'',
  kind:'paid',archived:false,venue:'',location:'',store_url:'',recording_url:'',
  program_speakers:[],tasks:TASKS()},over);

const PEOPLE={p1:{coordinator:'coord@example.org',moderator:'mod@example.org'}};

function draw(v){
  programs=[]; categories=[]; progCats={}; spkCats={}; links={};
  uploads={}; history=[]; metrics={}; runSheet={};
  team=TEAM; myRole='admin'; myEmail=v.myEmail||'';
  progPeople=v.people!==undefined?v.people:PEOPLE;
  session={user:{email:'tara@salinaslawgroup.com'}};
  view=Object.assign({name:'season',tab:'all',id:null,cat:null,edit:false,
    editSpeaker:null,creating:false,editStats:false},v);
  if(v.progs){ programs=v.progs; progCats={}; programs.forEach(p=>progCats[p.id]=[]); }
  try{ render(); return global.__a.innerHTML; }
  catch(e){ console.log('    THROW -> '+e.message); fails++; return ''; }
}

const byId=(h,id)=>{const m=new RegExp('<select id="'+id+'">([\\s\\S]*?)</select>').exec(h);
  return m?m[1]:'';};
const byAssign=(h,tid)=>{
  const m=new RegExp('<select class="conf" data-assign="'+tid+'"[^>]*>([\\s\\S]*?)</select>').exec(h);
  return m?m[1]:'';};
const cell=(h,pid,role)=>{
  const m=new RegExp('<select class="conf" data-pp="'+pid+'\\|'+role+'"[^>]*>([\\s\\S]*?)</select>').exec(h);
  return m?m[1]:'';};
const setAll=(h,role)=>{
  const m=new RegExp('<select class="conf pp-all" data-ppall="'+role+'"[^>]*>([\\s\\S]*?)</select>').exec(h);
  return m?m[1]:'';};
const vals=b=>[...b.matchAll(/<option value="([^"]*)"/g)].map(m=>m[1]);
const selected=b=>{const m=/<option value="([^"]*)" selected>/.exec(b);return m?m[1]:null;};

console.log('roles a program can have someone in:');
ok('coordinator and moderator are both there',
  PROGRAM_ROLES.some(r=>r.id==='coordinator') && PROGRAM_ROLES.some(r=>r.id==='moderator'));
ok('marketing is there', PROGRAM_ROLES.some(r=>r.id==='marketing'));
ok('"admin" is NOT — that is access, not a job on a program',
  !PROGRAM_ROLES.some(r=>r.id==='admin'));
ok('every id is lower case, to match tasks.owner_role after folding',
  PROGRAM_ROLES.every(r=>r.id===r.id.toLowerCase()));

console.log('\nthe inheritance rule (mirrored in SQL as inherit_assignee):');
progPeople={p1:{coordinator:'c@x.org',moderator:'m@x.org'}};
ok('a Coordinator task takes the coordinator',
  inheritedAssignee({id:'p1'},{owner_role:'Coordinator'})==='c@x.org');
ok('a Moderator task takes the moderator',
  inheritedAssignee({id:'p1'},{owner_role:'Moderator'})==='m@x.org');
ok('a role nobody holds inherits nobody',
  inheritedAssignee({id:'p1'},{owner_role:'Marketing'})==='');
ok('matching ignores case and padding',
  inheritedAssignee({id:'p1'},{owner_role:'  coordinator '})==='c@x.org');
ok('a missing role does not throw', inheritedAssignee({id:'p1'},{})==='');
ok('a program with nobody named inherits nobody',
  inheritedAssignee({id:'p9'},{owner_role:'Coordinator'})==='');
ok('personFor reads a role straight off a program',
  personFor('p1','moderator')==='m@x.org');
ok('personFor on an unknown program is empty, not undefined',
  personFor('nope','coordinator')==='');

console.log('\nnaming a person:');
team=TEAM;   // personLabel reads module state, which no draw() has set yet
ok('a team member shows their full name', personLabel('coord@example.org')==='Casey Coordinator');
ok('case does not matter', personLabel('COORD@example.org')==='Casey Coordinator');
ok('someone off the team falls back to the local part',
  personLabel('someone@elsewhere.org')==='someone');
ok('empty stays empty', personLabel('')==='');
ok('null does not throw', personLabel(null)==='');

console.log('\nthe program edit form:');
let h=draw({name:'detail',id:'p1',edit:true,progs:[mkProg('p1','2027-03-04')]});
PROGRAM_ROLES.forEach(r=>
  ok('has a '+r.label+' dropdown', byId(h,'ep-pp-'+r.id).length>0));
let b=byId(h,'ep-pp-coordinator');
ok('it offers nobody plus all four team members', vals(b).length===5 && vals(b)[0]==='');
ok('the program’s coordinator is selected', selected(b)==='coord@example.org');
ok('it shows people by name, not address', b.includes('Casey Coordinator'));
ok('the moderator is selected too',
  selected(byId(h,'ep-pp-moderator'))==='mod@example.org');
ok('a role nobody holds has nothing selected',
  selected(byId(h,'ep-pp-marketing'))===null);

console.log('\nthe docket table:');
h=draw({name:'detail',id:'p1',progs:[mkProg('p1','2027-03-04')]});
ok('there is an "Assigned to" column', h.includes('<th>Assigned to</th>'));
ok('the Owner column still exists', h.includes('<th>Owner</th>'));
['t1','t2','t3'].forEach(id=>
  ok('task '+id+' has an assignment dropdown', byAssign(h,id).length>0));
ok('an inherited Coordinator task shows the coordinator',
  selected(byAssign(h,'t1'))==='coord@example.org');
ok('an inherited Moderator task shows the moderator',
  selected(byAssign(h,'t2'))==='mod@example.org');
ok('a hand-assigned task shows the person chosen, not the coordinator',
  selected(byAssign(h,'t3'))==='chair@example.org');
ok('only the hand-assigned task is marked by hand',
  (h.match(/class="by-hand"/g)||[]).length===1);

console.log('\n"open for you":');
ok('the coordinator sees their one open task',
  draw({name:'detail',id:'p1',progs:[mkProg('p1','2027-03-04')],
    myEmail:'coord@example.org'}).includes('1 open for you'));
ok('someone with nothing assigned sees no count',
  !draw({name:'detail',id:'p1',progs:[mkProg('p1','2027-03-04')],
    myEmail:'nobody@example.org'}).includes('open for you'));
ok('a completed task does not count as open',
  !draw({name:'detail',id:'p1',myEmail:'mod@example.org',
    progs:[mkProg('p1','2027-03-04',
      {tasks:TASKS().map(t=>t.id==='t2'?{...t,done:true}:t)})]}).includes('open for you'));

console.log('\nthe bulk Assignments grid:');
const SEASON=[mkProg('p1','2027-03-04'),mkProg('p2','2027-04-08'),
  mkProg('p3','2026-01-10'),                        // past
  mkProg('p4','2027-05-06',{archived:true})];       // catalogue
h=draw({tab:'assign',progs:SEASON});
ok('there is a nav button for it', h.includes('id="assign-btn"'));
ok('an upcoming program gets a row', cell(h,'p1','coordinator').length>0);
ok('a second upcoming program gets a row', cell(h,'p2','coordinator').length>0);
ok('a PAST program is left out', cell(h,'p3','coordinator')==='');
ok('an ARCHIVED catalogue entry is left out', cell(h,'p4','coordinator')==='');
PROGRAM_ROLES.forEach(r=>
  ok('p1 has a cell for '+r.label, cell(h,'p1',r.id).length>0));
ok('a filled cell shows who holds the role',
  selected(cell(h,'p1','coordinator'))==='coord@example.org');
ok('an empty cell shows nobody selected',
  selected(cell(h,'p1','marketing'))===null);
ok('a program with no people at all still renders its cells',
  selected(cell(h,'p2','coordinator'))===null && cell(h,'p2','moderator').length>0);
PROGRAM_ROLES.forEach(r=>
  ok('the '+r.label+' column has a set-all control', setAll(h,r.id).length>0));
b=setAll(h,'coordinator');
ok('set-all starts blank so it cannot fire on render', vals(b)[0]==='');
ok('set-all lists the team', vals(b).length===5);
ok('it counts the two upcoming programs', h.includes('2 upcoming'));
ok('it counts the gaps: 8 cells, 2 filled, 6 to fill', h.includes('6 still to fill'));
ok('it says Marketing owns no docket task yet', /no docket task is owned by those roles/.test(h));

h=draw({tab:'assign',progs:SEASON,
  people:{p1:{coordinator:'coord@example.org',moderator:'mod@example.org',
              marketing:'promo@example.org',emc_chair:'chair@example.org'},
          p2:{coordinator:'coord@example.org',moderator:'mod@example.org',
              marketing:'promo@example.org',emc_chair:'chair@example.org'}}});
ok('a fully staffed season reports no gaps', h.includes('all filled'));

ok('with nothing upcoming it explains itself rather than showing an empty grid',
  draw({tab:'assign',progs:[mkProg('p3','2026-01-10')]})
    .includes('No upcoming programs'));

console.log('\nthe data actually travels (a render test cannot see this):');
ok('loadData queries program_people',
  /sb\.from\("program_people"\)\.select\("program_id, role, email"\)/.test(SRC));
ok('the query fetches the task assignee', /assignee_email, assignee_set/.test(SRC));
ok('the two old columns are no longer selected',
  !/coordinator_email, moderator_email/.test(SRC));
ok('nothing still reads the dropped columns',
  !/p\.coordinator_email|p\.moderator_email/.test(SRC));
ok('saveProgram upserts the roles from the form',
  /role:r\.id, email: val\("ep-pp-"\+r\.id\)/.test(SRC));
ok('upserts name the conflict target, or they insert duplicates',
  (SRC.match(/onConflict: "program_id,role"/g)||[]).length>=3);
ok('a single cell is wired', /on\("\[data-pp\]","change"/.test(SRC));
ok('set-all is wired', /on\("\[data-ppall\]","change"/.test(SRC));
ok('set-all asks before writing to every program', /confirm\("Set "\+personLabel/.test(SRC));
ok('the task dropdown is still wired', /on\("\[data-assign\]","change"/.test(SRC));

console.log(fails?'\n'+fails+' FAILED':'\nall passed');
process.exit(fails?1:0);
