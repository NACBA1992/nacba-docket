// Comments on a suggestion.
//
// Why this test exists. Commenting looks like the smallest feature on the
// board and it has four ways to go wrong where nothing crashes:
//
//   1. THE TEXTAREA ID IS WRITTEN TWICE. suggestionThread() writes
//      id="sc-body-<suggestion id>" and addSuggComment() reads
//      val("sc-body-" + id). If either side changes its shape, Post
//      silently sends an empty body and the only symptom is a toast
//      saying "write something first" on a box you just typed into.
//   2. A SHUT THREAD LOOKS THE SAME AS NO FEATURE. The thread is closed
//      by default, so almost every assertion about the card would pass
//      with the whole feature deleted. The open/shut pair below is what
//      catches that, and so is the count on the shut card: feedback
//      nobody can see is feedback nobody gives.
//   3. THE DELETE BUTTON IS AN AUTHORISATION CLAIM. RLS allows deleting
//      only your own comment, so showing the button on someone else's is
//      a promise the database will refuse. Asserted from both sides.
//   4. A COMMENT IS THE ONLY FREE TEXT ON THIS SCREEN THAT SOMEBODY ELSE
//      WROTE. Everything else on the board is typed by the person reading
//      it. So escaping is tested with a real tag, not assumed.
//
// The clock is not pinned here: nothing in this feature does date
// arithmetic. The timestamps only have to render.
const fs=require('fs'),vm=require('vm');
const SRC=fs.readFileSync(__dirname+'/../index.html','utf8');
const MIG=fs.readFileSync(
  __dirname+'/../supabase/migrations/20261102000600_suggestion_comments.sql','utf8');
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
global.window={scrollTo(){},addEventListener(){},open:()=>null,confirm:()=>true};
global.location={href:'https://docket.nacba.org/'};
global.localStorage={getItem:()=>null,setItem(){}};
global.setTimeout=()=>{}; global.navigator={clipboard:{}}; global.confirm=()=>true;
vm.runInThisContext(s);

let fails=0;
const ok=(n,c)=>{console.log((c?'    ok   ':'    FAIL ')+n); if(!c)fails++;};

// Invented addresses on purpose: this repo is public, so no real person's
// email belongs in a committed fixture.
const ME='chair@example.org';
const TEAM=[
  {email:ME,                  role:'emc_chair', full_name:'Charlie Chair', title:'EMC Chair'},
  {email:'promo@example.org', role:'marketing', full_name:'Pat Promotion', title:'Marketing'}
];

const SUGGS=()=>[
  {id:'s1',title:'Send the invitation from the portal',detail:'',area:'portal',
   status:'planned',submitted_by:'build plan',decided_note:'',
   created_at:'2026-11-02T00:00:00Z',updated_at:'2026-11-02T00:00:00Z'},
  {id:'s2',title:'The Run of Show template',detail:'',area:'documents',
   status:'new',submitted_by:ME,decided_note:'',
   created_at:'2026-11-02T00:00:00Z',updated_at:'2026-11-02T00:00:00Z'}
];

// s1 has three comments: two from other people, one mine. s2 has none, so
// the empty case is covered by a real row rather than by an empty board.
const COMMENTS=()=>({
  s1:[
    {id:'c1',suggestion_id:'s1',author:'promo@example.org',
     body:'Who signs off on the From line?',created_at:'2026-11-02T15:00:00Z'},
    {id:'c2',suggestion_id:'s1',author:'nobody@example.org',
     body:'Not on the team list, so no full name to show.',
     created_at:'2026-11-02T16:00:00Z'},
    {id:'c3',suggestion_id:'s1',author:ME,
     body:'Asked IT on the 2nd.\nStill waiting.',created_at:'2026-11-02T17:00:00Z'}
  ]
});

function draw(v){
  programs=[]; categories=[]; progCats={}; spkCats={}; links={};
  uploads={}; history=[]; metrics={}; runSheet={}; progPeople={};
  ideas=[]; ideaCats={};
  team=TEAM; myRole='admin'; myEmail=ME;
  suggestions=v.suggs!==undefined?v.suggs:SUGGS();
  suggComments=v.comments!==undefined?v.comments:COMMENTS();
  session={user:{email:ME}};
  view=Object.assign({name:'season',tab:'suggestions',id:null,cat:null,edit:false,
    editSpeaker:null,creating:false,editStats:false,sstatus:null,editSugg:null,
    openSugg:null},v);
  try{ render(); return global.__a.innerHTML; }
  catch(e){ console.log('    THROW -> '+e.message); fails++; return ''; }
}

// Every assertion below has to look INSIDE one card. A comment body and a
// suggestion title are both on the page whatever the thread is doing, so a
// plain h.includes() would pass with the feature switched off.
const card=(h,id)=>{
  const open=h.indexOf('data-scopen="'+id+'"');
  if(open<0) return '';
  const start=h.lastIndexOf('<section class="panel"',open);
  const next=h.indexOf('<section class="panel"',open);
  return h.slice(start, next<0 ? h.length : next);
};
const thread=(h,id)=>{
  const c=card(h,id), i=c.indexOf('class="sc-thread"');
  return i<0 ? '' : c.slice(i);
};

// ---------------------------------------------------------------
console.log('shut by default, but the card still says there is a conversation:');
let h=draw({});
ok('the toggle is on the card', card(h,'s1').includes('data-scopen="s1"'));
ok('it reports how many comments there are', card(h,'s1').includes('3 comments'));
ok('it is shut', card(h,'s1').includes('aria-expanded="false"'));
ok('so no thread is drawn', thread(h,'s1')==='');
ok('and no box to type in', !card(h,'s1').includes('id="sc-body-s1"'));
ok('a comment body is nowhere on the page while every thread is shut',
  !h.includes('Who signs off on the From line?'));
ok('a suggestion with none invites the first one',
  card(h,'s2').includes('Add a comment'));
ok('and does not say "0 comments"', !card(h,'s2').includes('0 comment'));

console.log('one comment is not "1 comments":');
const h1=draw({comments:{s1:[COMMENTS().s1[0]]}});
ok('singular', card(h1,'s1').includes('1 comment') &&
  !card(h1,'s1').includes('1 comments'));

console.log('opening one:');
const ho=draw({openSugg:'s1'});
ok('the toggle says so', card(ho,'s1').includes('aria-expanded="true"'));
ok('the thread is drawn', thread(ho,'s1')!=='');
ok('the oldest comment is there', thread(ho,'s1').includes('Who signs off on the From line?'));
ok('and the newest', thread(ho,'s1').includes('Asked IT on the 2nd.'));
ok('in the order they were written',
  thread(ho,'s1').indexOf('Who signs off')<thread(ho,'s1').indexOf('Asked IT'));
ok('an author on the team list shows as a name', thread(ho,'s1').includes('Pat Promotion'));
ok('an author who is not falls back to something, not blank',
  thread(ho,'s1').includes('nobody'));
ok('each comment carries a time', /class="sc-when"/.test(thread(ho,'s1')));
ok('there is a box to type in', card(ho,'s1').includes('id="sc-body-s1"'));
ok('the box is labelled for a screen reader',
  /id="sc-body-s1"[^>]*aria-label=/.test(card(ho,'s1')));
ok('and a button to post it', card(ho,'s1').includes('data-scadd="s1"'));

console.log('one thread at a time, so the page stays readable:');
ok('the other card is still shut', card(ho,'s2').includes('aria-expanded="false"'));
ok('and draws no box', !card(ho,'s2').includes('id="sc-body-s2"'));
ok("one suggestion's comments never appear under another",
  !card(ho,'s2').includes('Who signs off on the From line?'));

console.log('an empty thread, opened:');
const he=draw({openSugg:'s2'});
ok('says so rather than drawing nothing', card(he,'s2').includes('class="sc-none"'));
ok('and still offers the box', card(he,'s2').includes('id="sc-body-s2"'));

console.log('delete is only offered on your own, because RLS only allows that:');
const own=thread(ho,'s1').indexOf('data-scdel="c3"');
ok('mine can be deleted', own>-1);
ok("somebody else's cannot", !thread(ho,'s1').includes('data-scdel="c1"'));
ok('nor can one from an author off the team list',
  !thread(ho,'s1').includes('data-scdel="c2"'));
// Signed in as nobody at all: the fixture author must not suddenly match.
const hx=draw({openSugg:'s1'});
myEmail=''; const hy=(()=>{ try{ render(); return global.__a.innerHTML; }
  catch(e){ return ''; } })();
ok('signed in as nobody, nothing is deletable', !hy.includes('data-scdel='));

console.log('somebody else wrote this text, so it is escaped:');
const hesc=draw({openSugg:'s1',comments:{s1:[{id:'cx',suggestion_id:'s1',
  author:'promo@example.org',body:'<script>alert(1)</script> & "quoted"',
  created_at:'2026-11-02T15:00:00Z'}]}});
ok('the tag does not survive as markup', !hesc.includes('<script>alert(1)'));
ok('it is shown as text instead', hesc.includes('&lt;script&gt;'));
ok('and so are the ampersand and the quotes',
  hesc.includes('&amp;') && hesc.includes('&quot;quoted&quot;'));

console.log('line breaks in a comment are kept:');
ok('pre-wrap, so a two-line comment does not collapse',
  /\.sc-body\{[^}]*white-space:pre-wrap/.test(SRC));

// ---------------------------------------------------------------
// Everything above would pass if the comments never arrived from the
// database, or if Post wrote nothing back. These read index.html directly.
console.log('the data is asked for, and actually written:');
ok('loadData queries the table',
  /sb\.from\("suggestion_comments"\)\.select/.test(SRC));
ok('oldest first, which is the order a thread reads in',
  /sb\.from\("suggestion_comments"\)\.select\("\*"\)\.order\("created_at"\)/.test(SRC));
ok('the result is destructured, not dropped',
  /const \[[^\]]*\bsgcRes\b[^\]]*\] = await Promise\.all\(/.test(SRC));
ok('a missing table degrades quietly instead of blanking the portal',
  /sgcRes\.error \? \[\] :/.test(SRC));
ok('comments are grouped by suggestion', /suggComments\[c\.suggestion_id\]/.test(SRC));
ok('posting writes an insert', /sb\.from\("suggestion_comments"\)\.insert/.test(SRC));
ok('deleting writes a delete', /sb\.from\("suggestion_comments"\)\.delete/.test(SRC));

// The id the box is written with must be the id the handler reads back.
const addFn=SRC.slice(SRC.indexOf('async function addSuggComment'),
                      SRC.indexOf('const deleteSuggComment'));
ok('addSuggComment reads the id the thread writes',
  addFn.includes('val("sc-body-" + id)') || addFn.includes('val("sc-body-"+id)'));
ok('it refuses an empty comment', /if \(!body\)/.test(addFn));
ok('it sends no author — the database stamps that', !/author/.test(addFn));

console.log('the controls are wired to something:');
ok('the toggle is wired', /on\("\[data-scopen\]","click"/.test(SRC));
ok('Post is wired', /on\("\[data-scadd\]","click"/.test(SRC));
ok('delete is wired', /on\("\[data-scdel\]","click"/.test(SRC));
ok('delete asks first', /data-scdel[\s\S]{0,200}?window\.confirm/.test(SRC));
ok('the toggle shuts an open thread rather than only opening',
  /openSugg: view\.openSugg===id \? null : id/.test(SRC));
ok('leaving the screen and coming back shuts the thread',
  /sstatus:null, editSugg:null, openSugg:null/.test(SRC));

console.log('the migration:');
ok('row level security is on',
  /alter table suggestion_comments enable row level security/.test(MIG));
ok('it uses the house is_allowed() policy, not a new rule',
  /using \(public\.is_allowed\(\)/.test(MIG));
ok('everyone on the list can read the whole discussion',
  /for select to authenticated using \(public\.is_allowed\(\)\)/.test(MIG));
ok('and add to it', /for insert to authenticated with check \(public\.is_allowed\(\)\)/.test(MIG));
ok('editing is limited to the author',
  /for update to authenticated[\s\S]*?lower\(author\) = lower\(coalesce\(auth\.jwt\(\)/.test(MIG));
ok('deleting is too',
  /for delete to authenticated[\s\S]*?lower\(author\) = lower\(coalesce\(auth\.jwt\(\)/.test(MIG));
ok('matched case-insensitively, because addresses are typed by hand',
  (MIG.match(/lower\(author\)/g)||[]).length>=3);
ok('the author is stamped from the session, not trusted from the client',
  /new\.author := coalesce\(nullif\(auth\.jwt\(\) ->> 'email'/.test(MIG));
ok('and an edit cannot change who said it', /new\.author := old\.author/.test(MIG));
ok('the trigger is actually attached',
  /create trigger trg_stamp_suggestion_comment/.test(MIG));
ok('a blank comment cannot be stored', /check \(btrim\(body\) <> ''\)/.test(MIG));
ok('deleting a suggestion takes its comments with it',
  /references suggestions \(id\) on delete cascade/.test(MIG));
ok('a thread is indexed the way it is read',
  /on suggestion_comments \(suggestion_id, created_at\)/.test(MIG));
// Deliberate: the row already records who said what and when, so logging it
// would write every comment down twice. Asserted so nobody "fixes" it.
ok('log_changes is deliberately NOT attached',
  !/create trigger trg_log_suggestion_comments/.test(MIG));
ok('and the migration says why in writing',
  /WHY log_changes\(\) IS NOT ATTACHED HERE/.test(MIG));
ok('it ends in SELECTs, because the SQL editor shows no notices',
  /select 'the four policies'/.test(MIG) && !/raise notice/i.test(MIG));
ok('it is safe to re-run', (MIG.match(/if not exists|drop policy if exists|or replace|drop trigger if exists/g)||[]).length>=8);

console.log(fails? '  '+fails+' FAILED' : 'all passed');
process.exit(fails?1:0);
