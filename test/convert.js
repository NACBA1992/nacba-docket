// The packet's headshot conversion, run in an actual browser.
//
// This cannot be checked with a stub: the whole question is whether a
// canvas really re-encodes the bytes, and a fake canvas would answer yes
// to anything. It drives headless Chrome over the real function, lifted
// out of speaker.html so the test cannot drift from the page.
//
// Chrome cannot decode HEIC, so the HEIC case exercises the fallback
// advice rather than the conversion. Safari — which is what an iPhone
// speaker will be using — decodes it and converts. That one path is not
// verified here; the database check in 20261118000100 is what makes the
// guarantee hold regardless of browser.
const fs=require('fs'),path=require('path'),os=require('os');
const {execFileSync}=require('child_process');

const CHROME=['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
              '/Applications/Chromium.app/Contents/MacOS/Chromium',
              '/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>fs.existsSync(p));
if(!CHROME){ console.log('no Chrome found — skipping browser conversion test'); process.exit(0); }

const ROOT=path.join(__dirname,'..');
const body=fs.readFileSync(path.join(ROOT,'speaker.html'),'utf8')
  .split('<script type="module">')[1].split('</script>')[0];
const cap=body.match(/const IMAGE_CAP = \d+;/)[0];
const i=body.indexOf('async function readableImage(file){');
if(i<0){ console.log('FAIL readableImage is gone from speaker.html'); process.exit(1); }
let d=0,j=i; for(;;j++){ if(body[j]==='{')d++; else if(body[j]==='}'){d--; if(d===0){j++;break;}} }
const fn=body.slice(i,j);

const fx=f=>fs.readFileSync(path.join(__dirname,'fixtures',f)).toString('base64');
const page=`<!doctype html><meta charset="utf-8"><body><pre id="out">running</pre><script>
${cap}
${fn}
const mk=(b,type,name)=>{const bin=atob(b);const u=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
  return new File([u],name,{type});};
const F={ jpg:mk("${fx('real.jpg')}","image/jpeg","shot.jpg"),
          png:mk("${fx('real.png')}","image/png","shot.png"),
          gif:mk("${fx('real.gif')}","image/gif","shot.gif"),
          heic:mk("${fx('photo.heic')}","image/jpeg","IMG_4021.HEIC") };
const lines=[];
const ok=(n,c)=>lines.push((c?"ok   ":"FAIL ")+n);
(async()=>{
  const j=await readableImage(F.jpg);
  ok("a JPEG passes through untouched", !j.converted && j.mime==="image/jpeg" && j.blob===F.jpg);
  ok("nothing is re-encoded, so no detail is lost", j.blob.size===F.jpg.size);
  const p=await readableImage(F.png);
  ok("a PNG passes through untouched", !p.converted && p.mime==="image/png");
  const g=await readableImage(F.gif);
  ok("a format we cannot keep is converted", g.converted===true && g.mime==="image/jpeg");
  ok("the conversion produced bytes", g.blob.size>0);
  ok("the new size is reported back", g.w===48 && g.h===48);
  const head=new Uint8Array(await g.blob.slice(0,3).arrayBuffer());
  ok("and the result really is a JPEG", head[0]===255&&head[1]===216&&head[2]===255);
  try{
    const h=await readableImage(F.heic);
    ok("an HEIC labelled image/jpeg is never passed through", h.converted===true);
  }catch(e){
    ok("a browser that cannot decode HEIC says what to do instead",
       /iPhone photo/.test(e.message) && /Export/.test(e.message));
  }
  document.getElementById("out").textContent=lines.join("\\n");
})().catch(e=>{document.getElementById("out").textContent="FAIL threw: "+e.message;});
</script>`;

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'nacba-convert-'));
const file=path.join(tmp,'convert.html');
fs.writeFileSync(file,page);
const dom=execFileSync(CHROME,['--headless','--disable-gpu','--virtual-time-budget=8000',
  '--dump-dom','file://'+file],{encoding:'utf8',stdio:['ignore','pipe','ignore']});
fs.rmSync(tmp,{recursive:true,force:true});

const out=(dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)||[])[1]||'';
const text=out.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
console.log('headshot conversion, in a real browser:');
text.split('\n').forEach(l=>console.log('    '+l));
const fails=(text.match(/FAIL/g)||[]).length || (text==='running'||!text ? 1 : 0);
console.log(fails? '\n'+fails+' FAILED' : '\nall passed');
process.exit(fails?1:0);
