// The roll-up and the calendar, asked for on 2 Nov 2026: fold "Needs
// attention" down to one line of counts so the programs start higher, and
// show the season on a month or quarter calendar.
//
// Why these assertions and not others: the obvious check -- "is the title in
// the HTML" -- passes from the program cards alone, and "is the alert row
// there" passes whether the panel is open or shut. So every assertion here
// looks inside the one element it is about: the roll-up button, the
// alerts-list div, or a single month's <section class="cal-m">.
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
const store={};
global.localStorage={getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v)}};
global.setTimeout=()=>{}; global.navigator={clipboard:{}}; global.confirm=()=>true;
vm.runInThisContext(s);

let fails=0;
const ok=(n,c)=>{console.log((c?'    ok   ':'    FAIL ')+n); if(!c)fails++;};

// Pin the clock. Everything below is read against Mon 2 Nov 2026.
todayUTC = () => new Date(Date.UTC(2026,10,2));

const sp=(conf)=>[{id:'ps'+conf,topic:'',confirmation:conf,sort_order:0,
  speakers:{id:'s1',full_name:'Jenny L. Doling, Esq.',preferred_title:'',firm:'JDL',
    email:'jd@jdl.law',phone:'',pronunciation:'',headshot_location:'',bio_location:'',
    speaker_type:'debtor_attorney'},deliverables:[]}];
const prog=(o)=>Object.assign({slug:'x',kind:'paid',archived:false,note:'',venue:'',
  location:'',store_url:'',recording_url:'',description:'d',program_speakers:sp('confirmed'),
  tasks:[]},o);

const PROGS=[
  prog({id:'p1',event_date:'2026-11-12',title:'Means Test Update'}),
  prog({id:'p2',event_date:'2026-11-24',title:'Chapter 13 Plan Drafting',
        program_speakers:[],
        tasks:[{id:'t1',task:'Confirm speaker',offset_days:-30,done:false,gate_key:null}]}),
  prog({id:'p3',event_date:'2026-12-03',title:'Student Loan Discharge',
        description:'',program_speakers:sp('invited')}),
  prog({id:'p4',event_date:'2026-10-15',title:'Fall Convention Recap'}),
  prog({id:'p5',event_date:'2027-02-10',title:'Exemptions Deep Dive'}),
  prog({id:'p6',event_date:'2026-11-05',title:'Shelf Copy 2024',archived:true})
];

function draw(o){
  o=o||{};
  programs=PROGS; roster=[]; history=[]; links={}; uploads={}; team=[];
  categories=[{id:'c1',name:'Student Loans'}]; progCats={p3:['c1']}; spkCats={};
  myRole='admin'; metrics={}; runSheet={}; progPeople={};
  session={user:{email:'tara@salinaslawgroup.com'}};
  alertsOpen = !!o.alertsOpen;
  layout     = o.layout || 'cards';
  calSpan    = o.calSpan || 'month';
  calAnchor  = o.calAnchor || null;
  view={name:'season',tab:'upcoming',id:null,cat:o.cat||null,edit:false,
        editSpeaker:null,creating:false,q:'',stype:null};
  try { render(); return global.__a.innerHTML; }
  catch(e){ console.log('    THROW -> '+e.message); fails++; return ''; }
}

// Cut one element out of the page, so an assertion cannot be satisfied by
// something elsewhere on it.
const slice=(h,open,close)=>{
  const i=h.indexOf(open); if(i<0) return '';
  const j=h.indexOf(close,i); return j<0 ? h.slice(i) : h.slice(i,j+close.length);
};
const rollBtn = h => slice(h,'<button class="alerts-roll"','</button>');
const alertList = h => slice(h,'<div class="alerts-list"','</section>');
const months = h => {
  const box=slice(h,'<div class="cal-months','</div><div class="cal-legend"');
  return box.split('<section class="cal-m">').slice(1);
};

console.log('the roll-up, closed (how it arrives):');
let h=draw(), btn=rollBtn(h);
ok('a roll-up button is rendered',              btn.length>0);
ok('it reports itself closed',                  /aria-expanded="false"/.test(btn));
ok('it counts the flagged against the upcoming', btn.includes('2 of 4 upcoming programs'));
ok('chip: 1 without speakers',                  btn.includes('1 without speakers'));
ok('chip: 1 awaiting confirmation',             btn.includes('1 awaiting confirmation'));
ok('chip: 1 without a description',             btn.includes('1 without a description'));
ok('chip: 1 task overdue',                      btn.includes('1 task overdue'));
ok('no chip for a count of nought',             !btn.includes('0 '));
let lst=alertList(h);
ok('the list is hidden, not thrown away',       /<div class="alerts-list" id="alerts-list" hidden>/.test(h));
ok('both flagged programs are in it',           lst.includes('Chapter 13 Plan Drafting') &&
                                                lst.includes('Student Loan Discharge'));
ok('each with a way in',                        (lst.match(/data-open=/g)||[]).length===2);
ok('a program on track is not in it',           !lst.includes('Means Test Update'));
ok('the old always-open heading is gone',       !h.includes('class="alerts-head">Needs attention'));
ok('program cards still render',                h.includes('class="grid"') &&
                                                h.includes('Means Test Update'));

console.log('\nthe roll-up, opened:');
h=draw({alertsOpen:true}); btn=rollBtn(h);
ok('it reports itself open',                    /aria-expanded="true"/.test(btn));
ok('the list is no longer hidden',              /<div class="alerts-list" id="alerts-list">/.test(h));
ok('the counts stay on the button',             btn.includes('2 of 4 upcoming programs'));

console.log('\nnothing needs attention:');
const keep=PROGS.slice();
PROGS.length=0; PROGS.push(prog({id:'q1',event_date:'2026-11-20',title:'All In Order'}));
h=draw();
ok('no roll-up at all',                         !h.includes('alerts-roll'));
ok('no empty alerts section',                   !h.includes('class="alerts"'));
PROGS.length=0; keep.forEach(p=>PROGS.push(p));

console.log('\ncards or calendar:');
h=draw();
ok('cards by default',                          h.includes('class="grid"') && !h.includes('cal-months'));
ok('the toggle offers both',                    h.includes('data-layout="cards"') &&
                                                h.includes('data-layout="calendar"'));
ok('Cards is marked on',                        /data-layout="cards" aria-pressed="true"/.test(h));
ok('the upcoming…catalogue tabs are there', h.includes('data-tab="upcoming"') &&
                                                h.includes('data-tab="catalog"'));
h=draw({layout:'calendar'});
ok('calendar renders',                          h.includes('class="cal-months'));
ok('the card grid is gone',                     !h.includes('<div class="grid">'));
ok('Calendar is marked on',                     /data-layout="calendar" aria-pressed="true"/.test(h));
ok('the list tabs stand down',                  !h.includes('data-tab="upcoming"'));
ok('New program is still reachable',            h.includes('id="new-program"'));

console.log('\nthe month:');
h=draw({layout:'calendar'});
let ms=months(h);
ok('exactly one month',                         ms.length===1);
ok('titled November 2026',                      h.includes('<h2 class="cal-title">November 2026</h2>'));
ok('counts the month, not the season',          h.includes('>2 programs</span>'));
ok('seven weekday headers',                     (ms[0].match(/class="cal-dow"/g)||[]).length===7);
// cal-dow / cal-dn / cal-dot would all match a looser pattern
ok('whole weeks of cells',                      (ms[0].match(/class="cal-d["\s]/g)||[]).length%7===0);
ok('five weeks for Nov 2026, which starts Sunday',
                                                (ms[0].match(/class="cal-d["\s]/g)||[]).length===35);
ok('today is marked, once',                     (ms[0].match(/is-today/g)||[]).length===1);
ok('November programs are on it',               ms[0].includes('Means Test Update') &&
                                                ms[0].includes('Chapter 13 Plan Drafting'));
ok('December is not',                           !ms[0].includes('Student Loan Discharge'));
ok('nor is next February',                      !ms[0].includes('Exemptions Deep Dive'));
ok('the catalogue copy is not',                 !ms[0].includes('Shelf Copy 2024'));
ok('a flagged program reads as urgent',
   /class="cal-ev is-urgent" data-open="p2"/.test(ms[0]));
ok('one on track does not',
   /class="cal-ev " data-open="p1"/.test(ms[0]));
ok('events open the program',                   ms[0].includes('data-open="p1"'));
ok('a list sits under the grid for phones',     ms[0].includes('class="cal-list"') &&
                                                ms[0].includes('class="cal-li"'));
ok('and the dots that go with it',              ms[0].includes('class="cal-dot'));
ok('the legend explains the colours',           h.includes('Needs attention') &&
                                                h.includes('Already run'));

console.log('\nthe quarter:');
h=draw({layout:'calendar',calSpan:'quarter'}); ms=months(h);
ok('three months',                              ms.length===3);
ok('laid out as a quarter',                     h.includes('class="cal-months is-q"'));
ok('titled Q4 2026',                            h.includes('<h2 class="cal-title">Q4 2026</h2>'));
ok('October holds the one it ran',               ms[0].includes('Fall Convention Recap'));
ok('November holds its two',                     ms[1].includes('Means Test Update') &&
                                                 ms[1].includes('Chapter 13 Plan Drafting'));
ok('December holds the student loan one',        ms[2].includes('Student Loan Discharge'));
ok('each month is named',                        ms[0].includes('Oct 2026') &&
                                                 ms[2].includes('Dec 2026'));
ok('a month counts its own',                     /class="n">2</.test(ms[1]));
ok('a past program reads as run',                /cal-ev is-done" data-open="p4"/.test(ms[0]));
ok('four programs in the quarter',               h.includes('>4 programs</span>'));
ok('next February is not',                       !h.includes('Exemptions Deep Dive'));

console.log('\nmoving through the year:');
h=draw({layout:'calendar',calAnchor:new Date(Date.UTC(2026,11,1))});
ok('an anchored month is the one shown',         h.includes('December 2026'));
ok('and shows that month’s programs',       h.includes('Student Loan Discharge'));
h=draw({layout:'calendar',calSpan:'quarter',calAnchor:new Date(Date.UTC(2027,0,1))});
ok('a quarter snaps to its first month',         h.includes('Q1 2027'));
ok('February lands inside it',                   h.includes('Exemptions Deep Dive'));
h=draw({layout:'calendar',calAnchor:new Date(Date.UTC(2026,10,17))});
ok('mid-month anchors still read as the month',  h.includes('November 2026'));

console.log('\nthe category filter still bites:');
h=draw({layout:'calendar',calSpan:'quarter',cat:'c1'});
ok('only the tagged program shows',              h.includes('Student Loan Discharge') &&
                                                 !h.includes('Means Test Update'));
ok('and the filter says so',                     h.includes('filtered to Student Loans'));

console.log('\nthe choices are remembered:');
store['docket.alertsOpen']='1'; store['docket.layout']='calendar';
store['docket.calSpan']='quarter';
ok('an open roll-up is read back',               pref('alertsOpen','0')==='1');
ok('calendar is read back',                      pref('layout','cards')==='calendar');
ok('quarter is read back',                       pref('calSpan','month')==='quarter');
setPref('alertsOpen','0');
ok('and written',                                store['docket.alertsOpen']==='0');

console.log(fails?'\n'+fails+' FAILED':'\nall passed');
process.exit(fails?1:0);
