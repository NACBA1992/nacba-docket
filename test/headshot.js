// Real image bytes, not a 14-byte stub. The first version of this feature
// passed its tests and failed on the first real photo, because every test
// image was a fake. These are produced by sips from an actual JPEG.
const fs=require('fs'),vm=require('vm'),path=require('path');
const IMG=path.join(__dirname,'fixtures');
let s=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8')
 .split('<script type="module">')[1].split('</script>')[0];
s=s.replace(/^import .*$/m,'')
   .replace(/^const sb =.*$/m,'var sb={auth:{onAuthStateChange(){},getSession:async()=>({data:{}})},rpc:(n,a)=>Promise.resolve(global.__rpcReply(n,a))};')
   .replace(/^const app = .*$/m,'var app=global.__a;')
   .replace(/^const /gm,'var ').replace(/^let /gm,'var ');
const mkEl=(a={})=>({innerHTML:'',textContent:'',className:'',value:'',hidden:true,
  classList:{contains:()=>false},getAttribute:k=>a[k]??null,addEventListener(){},
  querySelectorAll:()=>[],scrollIntoView(){},focus(){},remove(){}});
global.__a=mkEl(); const st={}; const saved=[]; const toasts=[];
global.document={getElementById:i=>(st[i]=st[i]||mkEl()),querySelectorAll:()=>[],
  querySelector:()=>null,body:{appendChild(){}},
  createElement:()=>{const o={set href(v){},set download(v){saved.push(v);},click(){},remove(){},style:{}};return o;}};
global.window={scrollTo(){},addEventListener(){},prompt:()=>null};
global.location={href:'https://docket.nacba.org/'};
global.localStorage={getItem:()=>null,setItem(){}};
global.setTimeout=(f)=>{}; global.clearTimeout=()=>{};
vm.runInThisContext(s);
// capture what the user is told
const realToast = global.toast; global.toast = (t,err)=>{ toasts.push({t,err:!!err}); };
roster=[{id:'s1',full_name:'Marion Delacroix-Hale'}]; bios={};

let fails=0;
const check=(l,t)=>{console.log(l);t.forEach(([n,f])=>{let ok=false;try{ok=f();}catch(e){ok=false;}
  if(!ok)fails++;console.log((ok?'    ok   ':'    FAIL ')+n);});};
const bytes = f => new Uint8Array(fs.readFileSync(path.join(IMG,f)));
const cut   = (f,n) => bytes(f).slice(0, n);
// fixtures are small real images produced by sips from NACBA's own logo

// ---------- what the bytes are ----------
check('real files are identified from their bytes:',[
 ['a JPEG is a JPEG',      ()=>{const r=identifyImage(bytes('real.jpg'));  return r.ok && r.ext==='jpg';}],
 ['a PNG is a PNG',        ()=>{const r=identifyImage(bytes('real.png'));  return r.ok && r.ext==='png';}],

]);

check('the two failures a coordinator cannot tell apart are told apart:',[
 ['an iPhone HEIC is named, not called damaged', ()=>{
    const r=identifyImage(bytes('photo.heic'));
    return !r.ok && /HEIC/.test(r.message) && /resend/i.test(r.message); }],
 ['a JPEG cut off mid-upload is called incomplete', ()=>{
    const r=identifyImage(cut('real.jpg', 2000));
    return !r.ok && /cut off|incomplete/i.test(r.message); }],
 ['a PNG cut off mid-upload is called incomplete', ()=>{
    const r=identifyImage(cut('real.png', 2000));
    return !r.ok && /cut off|incomplete/i.test(r.message); }],
 ['an empty column is called empty', ()=>{
    const r=identifyImage(new Uint8Array(0)); return !r.ok && /empty/i.test(r.message); }],
 ['random bytes are called damaged', ()=>{
    const r=identifyImage(new Uint8Array([1,2,3,4,5,6,7,8,9,10,11,12]));
    return !r.ok && /damaged/i.test(r.message); }],
 ['a PDF sent as a photo says so', ()=>{
    const r=identifyImage(new Uint8Array([0x25,0x50,0x44,0x46,0x2d,0x31,0x2e,0x34]));
    return !r.ok && /PDF/.test(r.message); }],
]);

// ---------- the whole path, at size ----------
// base64 as Postgres encode() produces it: wrapped at 76 characters.
const wrap = b64 => b64.replace(/(.{76})/g, '$1\n');
const run = async (file, mime) => {
  saved.length=0; toasts.length=0;
  const raw = fs.readFileSync(path.join(IMG,file));
  global.__rpcReply = () => ({ data:{ ok:true, mime, b64: wrap(raw.toString('base64')),
                                      at:'2026-11-12T18:04:00Z' }, error:null });
  await downloadHeadshot('s1','Marion Delacroix-Hale');
  return { raw, saved:[...saved], toasts:[...toasts] };
};

(async () => {
  const big = await run('real.jpg','image/jpeg');
  check('a real photo survives the whole round trip:',[
   ['it saved a file',        ()=>big.saved.length===1],
   ['named from the speaker', ()=>/^Marion-Delacroix-Hale-headshot\.jpg$/.test(big.saved[0])],
   ['no error shown',         ()=>!big.toasts.some(x=>x.err)],
   ['the size is reported',   ()=>/KB|MB/.test(big.toasts.map(x=>x.t).join(' '))],
  ]);

  // Size, on the decode path, where size is the only thing that matters.
  // 6 MB of bytes through Postgres-style wrapped base64 — bigger than any
  // headshot the 10 MB cap allows once base64 inflation is counted.
  const huge = Buffer.alloc(6*1024*1024);
  for (let i=0;i<huge.length;i++) huge[i]=(i*7+i%251)&0xff;
  check('a 6 MB payload decodes intact:',[
   ['every byte survives', ()=>{
      const bin=atob(wrap(huge.toString('base64')));
      if (bin.length!==huge.length) return false;
      for(let i=0;i<huge.length;i+=997) if((bin.charCodeAt(i)&0xff)!==huge[i]) return false;
      return true; }],
  ]);

  // Postgres wraps base64 at 76 chars; atob must tolerate the newlines.
  check('line-wrapped base64 decodes byte for byte:',[
   ['wrapping really is present', ()=>wrap(fs.readFileSync(path.join(IMG,'real.jpg')).toString('base64')).includes('\n')],
   ['decoded length matches the file', ()=>{
      const raw=fs.readFileSync(path.join(IMG,'real.jpg'));
      const bin=atob(wrap(raw.toString('base64')));
      return bin.length===raw.length; }],
   ['every byte matches', ()=>{
      const raw=fs.readFileSync(path.join(IMG,'real.jpg'));
      const bin=atob(wrap(raw.toString('base64')));
      for(let i=0;i<raw.length;i++) if((bin.charCodeAt(i)&0xff)!==raw[i]) return false;
      return true; }],
  ]);

  // A PNG whose row says image/jpeg: the old code named it .jpg and macOS balked.
  global.__rpcReply = () => { const raw=fs.readFileSync(path.join(IMG,'real.png'));
    return { data:{ ok:true, mime:'image/jpeg', b64:wrap(raw.toString('base64')) }, error:null }; };
  saved.length=0; toasts.length=0;
  await downloadHeadshot('s1','Marion Delacroix-Hale');
  check('a mislabelled file is saved by what it is, not what the row claims:',[
   ['saved as .png',           ()=>/\.png$/.test(saved[0]||'')],
   ['and the mismatch is said', ()=>/recorded as image\/jpeg/.test(toasts.map(x=>x.t).join(' '))],
  ]);

  // HEIC all the way through: the speaker must be asked, not the file handed over.
  global.__rpcReply = () => { const raw=fs.readFileSync(path.join(IMG,'photo.heic'));
    return { data:{ ok:true, mime:'image/jpeg', b64:wrap(raw.toString('base64')) }, error:null }; };
  saved.length=0; toasts.length=0;
  await downloadHeadshot('s1','Marion Delacroix-Hale');
  check('an HEIC is refused with a usable sentence:',[
   ['nothing was saved',   ()=>saved.length===0],
   ['the message names HEIC and says what to ask for',
     ()=>toasts.some(x=>x.err && /HEIC/.test(x.t) && /JPEG or PNG/.test(x.t))],
  ]);

  // A database error must reach the screen, not be swallowed.
  global.__rpcReply = () => ({ data:null, error:{ message:'function public.speaker_headshot(uuid) does not exist', code:'42883' } });
  saved.length=0; toasts.length=0;
  await downloadHeadshot('s1','Marion Delacroix-Hale');
  check('a database error is quoted, not hidden:',[
   ['nothing saved',       ()=>saved.length===0],
   ['the real message shows',
     ()=>toasts.some(x=>x.err && /does not exist/.test(x.t))],
  ]);

  console.log(fails? '\n'+fails+' FAILED' : '\nall passed');
  process.exit(fails?1:0);
})();
