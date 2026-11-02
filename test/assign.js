// Task assignment — who owes a task, not just which role owns it.
//
// Why this test exists: before this, `tasks.owner_role` held a role NAME
// copied from the template and was compared to nobody. The feature has three
// moving parts that have to agree -- a per-program coordinator/moderator, an
// inheritance rule, and a per-task override -- and the override must survive a
// change of coordinator. The two traps:
//
//   1. The inheritance rule is written TWICE, in SQL (inherit_assignee) and in
//      JS (inheritedAssignee), so the trigger and the "revert to inherited"
//      button can disagree. The pure-logic block below pins the JS side.
//   2. A render test passes happily while the SELECT never fetches the new
//      columns, so the UI shows "unassigned" for everything. The last block
//      greps the source for the query and the save.
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
// email belongs in a fixture.
const TEAM=[
  {email:'coord@example.org', role:'coordinator', full_name:'Casey Coordinator', title:'Coordinator'},
  {email:'mod@example.org',   role:'moderator',   full_name:'Morgan Moderator',   title:'Moderator'},
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

const prog=(over={})=>[Object.assign({
  id:'p1',slug:'s',event_date:'2027-03-04',title:'T',description:'d',note:'',
  kind:'paid',archived:false,venue:'',location:'',store_url:'',recording_url:'',
  coordinator_email:'coord@example.org',moderator_email:'mod@example.org',
  program_speakers:[],tasks:TASKS()},over)];

function draw(v){
  programs=[]; categories=[]; progCats={}; spkCats={}; links={};
  uploads={}; history=[]; metrics={}; runSheet={};
  team=TEAM; myRole='admin'; myEmail=v.myEmail||'';
  session={user:{email:'tara@salinaslawgroup.com'}};
  view=Object.assign({name:'season',tab:'all',id:null,cat:null,edit:false,
    editSpeaker:null,creating:false,editStats:false},v);
  if(v.progs){ programs=v.progs; progCats={p1:[]}; }
  try{ render(); return global.__a.innerHTML; }
  catch(e){ console.log('    THROW -> '+e.message); fails++; return ''; }
}

const byId=(h,id)=>{const m=new RegExp('<select id="'+id+'">([\\s\\S]*?)</select>').exec(h);
  return m?m[1]:'';};
const byAssign=(h,tid)=>{
  const m=new RegExp('<select class="conf" data-assign="'+tid+'"[^>]*>([\\s\\S]*?)</select>').exec(h);
  return m?m[1]:'';};
const vals=b=>[...b.matchAll(/<option value="([^"]*)"/g)].map(m=>m[1]);
const selected=b=>{const m=/<option value="([^"]*)" selected>/.exec(b);return m?m[1]:null;};

console.log('the inheritance rule (mirrored in SQL as inherit_assignee):');
const P={coordinator_email:'c@x.org',moderator_email:'m@x.org'};
ok('a Coordinator task takes the coordinator',
  inheritedAssignee(P,{owner_role:'Coordinator'})==='c@x.org');
ok('a Moderator task takes the moderator',
  inheritedAssignee(P,{owner_role:'Moderator'})==='m@x.org');
ok('any other role inherits nobody',
  inheritedAssignee(P,{owner_role:'Marketing'})==='');
ok('matching ignores case and padding',
  inheritedAssignee(P,{owner_role:'  coordinator '})==='c@x.org');
ok('a missing role does not throw',
  inheritedAssignee(P,{})==='');
ok('a program with nobody named inherits nobody',
  inheritedAssignee({coordinator_email:'',moderator_email:''},{owner_role:'Coordinator'})==='');

console.log('\nnaming a person:');
team=TEAM;   // personLabel reads module state, which no draw() has set yet
ok('a team member shows their full name', personLabel('coord@example.org')==='Casey Coordinator');
ok('case does not matter', personLabel('COORD@example.org')==='Casey Coordinator');
ok('someone off the team falls back to the local part',
  personLabel('someone@elsewhere.org')==='someone');
ok('empty stays empty', personLabel('')==='');
ok('null does not throw', personLabel(null)==='');

console.log('\nthe program edit form:');
let h=draw({name:'detail',id:'p1',edit:true,progs:prog()});
let b=byId(h,'ep-coord');
ok('a coordinator dropdown is rendered', b.length>0);
ok('it offers nobody plus all three team members',
  JSON.stringify(vals(b))===JSON.stringify(['','coord@example.org','mod@example.org','chair@example.org']));
ok('the program’s coordinator is selected', selected(b)==='coord@example.org');
ok('it shows people by name, not address', b.includes('Casey Coordinator'));
b=byId(h,'ep-mod');
ok('a moderator dropdown is rendered', b.length>0);
ok('the program’s moderator is selected', selected(b)==='mod@example.org');

console.log('\na program with nobody named yet:');
b=byId(draw({name:'detail',id:'p1',edit:true,
  progs:prog({coordinator_email:'',moderator_email:''})}),'ep-coord');
ok('nothing is pre-selected', selected(b)===null);
ok('the blank option is still first', vals(b)[0]==='');

console.log('\nthe docket table:');
h=draw({name:'detail',id:'p1',progs:prog()});
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
ok('every dropdown offers unassigned', byAssign(h,'t1').includes('value=""'));
ok('only the hand-assigned task is marked by hand',
  (h.match(/class="by-hand"/g)||[]).length===1);

console.log('\n"open for you":');
ok('the coordinator sees their one open task',
  draw({name:'detail',id:'p1',progs:prog(),myEmail:'coord@example.org'})
    .includes('1 open for you'));
ok('the chair sees the task assigned to them by hand',
  draw({name:'detail',id:'p1',progs:prog(),myEmail:'chair@example.org'})
    .includes('1 open for you'));
ok('someone with nothing assigned sees no count',
  !draw({name:'detail',id:'p1',progs:prog(),myEmail:'nobody@example.org'})
    .includes('open for you'));
ok('a signed-out render shows no count',
  !draw({name:'detail',id:'p1',progs:prog()}).includes('open for you'));
ok('a completed task does not count as open',
  !draw({name:'detail',id:'p1',myEmail:'mod@example.org',
    progs:prog({tasks:TASKS().map(t=>t.id==='t2'?{...t,done:true}:t)})})
    .includes('open for you'));

console.log('\nthe data actually travels (a render test cannot see this):');
ok('the query fetches the program’s two people',
  /coordinator_email, moderator_email/.test(SRC));
ok('the query fetches the task assignee',
  /assignee_email, assignee_set/.test(SRC));
ok('saveProgram writes the coordinator',
  /coordinator_email: val\("ep-coord"\)/.test(SRC));
ok('saveProgram writes the moderator',
  /moderator_email: val\("ep-mod"\)/.test(SRC));
ok('the dropdown is wired to a change handler',
  /on\("\[data-assign\]","change"/.test(SRC));

console.log(fails?'\n'+fails+' FAILED':'\nall passed');
process.exit(fails?1:0);
