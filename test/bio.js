// The bio builder on the speaker packet page.
//
// First test to touch speaker.html at all. It exists because this page is
// the one speakers actually see, and because this project has twice shipped
// a handler with no markup behind it. So: render the page, then assert the
// fields are really in the <section id="bio">, and separately assert the
// RPCs get called with the names the migration actually defines -- a typo
// in an RPC name is invisible until a speaker clicks Save.
const fs=require('fs'),vm=require('vm');
let s=fs.readFileSync(__dirname+'/../speaker.html','utf8')
 .split('<script type="module">')[1].split('</script>')[0];

const calls=[];
s=s.replace(/^import .*$/m,'')
   .replace(/^const sb =.*$/m,
     'var sb={rpc:async(name,args)=>{global.__calls.push({name,args});'+
     'return {data:global.__reply[name]||{ok:true},error:null};}};')
   .replace(/^const app = .*$/m,'var app=global.__a;')
   .replace(/^const /gm,'var ').replace(/^let /gm,'var ');
// The trailing bootstrap IIFE would fire a real packet load. Cut from the
// LAST one, not the first -- wireBio opens with the same construct, and a
// greedy match silently truncates the module.
{ const i=s.lastIndexOf('(async function () {');
  if(i<0) throw new Error('bootstrap IIFE not found - speaker.html changed shape');
  s=s.slice(0,i); }

global.__calls=calls;
global.__reply={ speaker_bio:{ok:true,bio:'An existing full bio.',
  bio_short:'Short one.',linkedin:'https://linkedin.com/in/x',
  bio_updated_at:'2026-10-01T00:00:00Z',bio_updated_by:'staff',
  has_headshot:true,headshot_at:'2026-10-02T00:00:00Z'} };

const listeners=[];
const mkEl=(id)=>({id,innerHTML:'',textContent:'',className:'',value:'',
  hidden:true,files:null,disabled:false,
  classList:{contains:()=>false,add(){},remove(){}},
  getAttribute:()=>null,
  addEventListener:(ev,fn)=>listeners.push({id,ev,fn}),
  querySelectorAll:()=>[],scrollIntoView(){},focus(){},remove(){}});
global.__a=mkEl('app'); const st={};
global.document={getElementById:i=>(st[i]=st[i]||mkEl(i)),
  querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>mkEl('x'),
  body:{appendChild(){}}};
global.window={scrollTo(){},addEventListener(){},print(){},open:()=>null};
global.location={href:'https://docket.nacba.org/speaker.html?k='+'t'.repeat(24),
  search:'?k='+'t'.repeat(24)};
global.navigator={mediaDevices:null,clipboard:{}};
global.FileReader=function(){ this.readAsDataURL=()=>{
  this.result='data:image/png;base64,QUJD'; this.onload&&this.onload(); }; };
global.setTimeout=(f)=>{}; global.localStorage={getItem:()=>null,setItem(){}};
global.MediaRecorder=undefined;
vm.runInThisContext(s);
// the bootstrap normally sets this from the URL; it has been removed
tok='t'.repeat(24);

let fails=0;
const ok=(n,c)=>{console.log((c?'    ok   ':'    FAIL ')+n); if(!c)fails++;};

const packet={
  program:{title:'Private Student Loan Adversaries',event_date:'2026-11-05'},
  speaker:{full_name:'Katrin DeLuca',preferred_title:'Esq.',firm:'DeLuca Law',
    address:'',email:'k@x.law',phone:'',pronunciation:'KAT-rin duh-LUCA',
    has_name_audio:false},
  co_speakers:[],deliverables:[],uploads:[],open:1,for:'speaker',topic:''
};

const tick=()=>new Promise(r=>setImmediate(r));

(async function main(){

render(packet);
const h=global.__a.innerHTML;

// pull out ONLY the bio section, so nothing elsewhere can satisfy these
const m=/<section id="bio">([\s\S]*?)<\/section>/.exec(h);
const bio=m?m[1]:'';

console.log('the bio section renders:');
ok('section id="bio" exists at all', bio.length>0);
ok('short-bio textarea', /<textarea id="bio-short"/.test(bio));
ok('full-bio textarea', /<textarea id="bio-full"/.test(bio));
ok('linkedin input', /id="bio-li"/.test(bio));
ok('save button', /id="bio-go"/.test(bio));
ok('status line', /id="bio-status"/.test(bio));
ok('headshot file input accepts images only',
   /id="bio-shot"[^>]*accept="image\/jpeg,image\/png,image\/webp"/.test(bio));
ok('explains it is kept against the person, not one webinar',
   /rather than one webinar/.test(bio));
ok('word-count targets are shown', /id="bio-short-count"/.test(bio)&&/id="bio-full-count"/.test(bio));

console.log('\nit sits in the main column, ahead of the uploader:');
ok('bio section comes before the upload section',
   h.indexOf('id="bio"')>0 && h.indexOf('id="bio"')<h.indexOf('id="upload"'));

console.log('\nwiring:');
const ids=listeners.map(l=>l.id);
ok('save button has a click handler', listeners.some(l=>l.id==='bio-go'&&l.ev==='click'));
ok('headshot input has a change handler', listeners.some(l=>l.id==='bio-shot'&&l.ev==='change'));
ok('both textareas recount on input',
   listeners.filter(l=>l.ev==='input'&&/bio-(short|full)/.test(l.id)).length===2);

await tick();   // wireBio's load is async
console.log('\nit loads what we already hold:');
ok('calls speaker_bio on render', calls.some(c=>c.name==='speaker_bio'));
ok('prefilled the short bio', st['bio-short'].value==='Short one.');
ok('prefilled the full bio', st['bio-full'].value==='An existing full bio.');
ok('prefilled linkedin', st['bio-li'].value==='https://linkedin.com/in/x');
ok('flags a bio NACBA typed, so the speaker checks it',
   /by NACBA/.test(st['bio-status'].textContent));

console.log('\nsaving:');
calls.length=0;
st['bio-short'].value='New short.'; st['bio-full'].value='New full.';
listeners.find(l=>l.id==='bio-go'&&l.ev==='click').fn({});
await tick();
const save=calls.find(c=>c.name==='speaker_save_bio');
ok('calls speaker_save_bio', !!save);
ok('sends the token', save&&save.args.tok.length>=16);
ok('sends both lengths and the link',
   save&&save.args.p_bio==='New full.'&&save.args.p_bio_short==='New short.'
   &&'p_linkedin' in save.args);

console.log('\nrefusing an empty save:');
calls.length=0;
st['bio-short'].value=''; st['bio-full'].value='   ';
listeners.find(l=>l.id==='bio-go'&&l.ev==='click').fn({});
await tick();
ok('does not call the database with nothing',
   !calls.some(c=>c.name==='speaker_save_bio'));
ok('and says why', /Write something first/.test(st['bio-status'].textContent));

console.log('\nheadshot:');
calls.length=0;
st['bio-shot'].files=[{name:'me.png',size:4,type:'image/png'}];
listeners.find(l=>l.id==='bio-shot'&&l.ev==='change').fn({});
await tick(); await tick();   // read the file, then call the database
const shot=calls.find(c=>c.name==='speaker_save_headshot');
ok('calls speaker_save_headshot', !!shot);
ok('sends mime and base64', shot&&shot.args.p_mime==='image/png'&&shot.args.p_b64==='QUJD');

console.log(fails?'\n'+fails+' FAILED':'\nall passed');
process.exit(fails?1:0);

})();
