const fs=require('fs'),vm=require('vm');
let s=fs.readFileSync('/Users/tarasalinas/Documents/Claude/Projects/NACBA Build/nacba-docket/index.html','utf8')
 .split('<script type="module">')[1].split('</script>')[0];
const calls=[];
s=s.replace(/^import .*$/m,'')
   .replace(/^const sb =.*$/m,`var sb={auth:{onAuthStateChange(){},getSession:async()=>({data:{}}),
     signInWithOtp:async a=>{calls.push(['send',a.email]);return{error:null};},
     verifyOtp:async a=>{calls.push(['verify',a.email,a.token,a.type]);
       return a.token==='123456'?{error:null}:{error:{message:'Token has expired or is invalid'}};}}};`)
   .replace(/^const app = .*$/m,'var app=global.__a;')
   .replace(/^const /gm,'var ').replace(/^let /gm,'var ');
const listeners={};
const mkEl=(a={})=>({innerHTML:'',textContent:'',className:'',value:'',disabled:false,
  classList:{contains:()=>false},getAttribute:k=>a[k]??null,focus(){},
  addEventListener:(ev,fn)=>{(listeners[a.__id]=listeners[a.__id]||{})[ev]=fn;},
  querySelector:()=>mkEl({__id:'submitbtn'}),requestSubmit(){listeners['verify']&&listeners['verify'].submit({preventDefault(){}});},
  querySelectorAll:()=>[]});
const st={};
global.__a=mkEl({__id:'app'});
global.document={getElementById:i=>(st[i]=st[i]||mkEl({__id:i})),
  querySelector:()=>mkEl({__id:'submitbtn'}),querySelectorAll:()=>[],createElement:mkEl,
  body:{appendChild(){}}};
global.window={scrollTo(){},addEventListener(){},location:{href:'https://x/'}};
global.location={href:'https://x/'}; global.localStorage={getItem:()=>null,setItem(){}};
global.setTimeout=()=>{}; global.navigator={clipboard:{}}; global.calls=calls;
vm.runInThisContext(s);

let fails=0;
const check=(l,t)=>{console.log(l);t.forEach(([n,f])=>{let ok=false;try{ok=f();}catch(e){}
  if(!ok)fails++;console.log((ok?'    ok   ':'    FAIL ')+n);});};

renderGate({step:'email',email:'',msg:'',kind:''});
let h=global.__a.innerHTML;
check('step one — email:',[
 ['asks for a code, not a link', ()=>/six-digit code/.test(h)&&!/sign-in link/.test(h)],
 ['button says send my code', ()=>h.includes('Send my code')],
 ['email field present', ()=>h.includes('id="email"')],
 ['no code field yet', ()=>!h.includes('id="code"')],
]);

(async()=>{
  document.getElementById('email').value='staff@nacba.com';
  await listeners['signin'].submit({preventDefault(){},target:document.getElementById('signin')});
  h=global.__a.innerHTML;
  check('after sending:',[
   ['code was requested', ()=>calls.some(c=>c[0]==='send'&&c[1]==='staff@nacba.com')],
   ['now on the code step', ()=>h.includes('id="code"')],
   ['shows the address', ()=>h.includes('staff@nacba.com')],
   ['numeric keypad on phones', ()=>h.includes('inputmode="numeric"')],
   ['autofills from the email', ()=>h.includes('autocomplete="one-time-code"')],
   ['six digits max', ()=>h.includes('maxlength="6"')],
   ['can resend', ()=>h.includes('id="resend"')],
   ['can change email', ()=>h.includes('id="other"')],
  ]);

  document.getElementById('code').value='999999';
  await listeners['verify'].submit({preventDefault(){},target:document.getElementById('verify')});
  h=global.__a.innerHTML;
  check('a wrong code:',[
   ['verified as an email OTP', ()=>calls.some(c=>c[0]==='verify'&&c[3]==='email')],
   ['says so plainly', ()=>/wrong or has expired/.test(h)],
   ['stays on the code step', ()=>h.includes('id="code"')],
  ]);

  calls.length=0;
  document.getElementById('code').value='123456';
  await listeners['verify'].submit({preventDefault(){},target:document.getElementById('verify')});
  check('the right code:',[
   ['token passed through', ()=>calls.some(c=>c[0]==='verify'&&c[2]==='123456')],
  ]);

  renderGate({step:'email',email:'',msg:'',kind:''});
  h=global.__a.innerHTML;
  check('signing out returns to step one:',[
   ['email field back', ()=>h.includes('id="email"')],
   ['no stale error', ()=>!/wrong or has expired/.test(h)],
  ]);
  process.exit(fails?1:0);
})();
