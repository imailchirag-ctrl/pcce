// Voice-based AI mock interview: Gemini writes the questions and scores the answers,
// the browser speaks (SpeechSynthesis) and listens (SpeechRecognition). Answers are voice only.
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
const $v=document.getElementById("view");
const MIC='<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const STOP='<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" fill="#fff"/></svg>';
let cfg,qs=[],idx=0,results=[],rec=null,finalText="",interim="",recording=false,t0=0,tick=null,stream=null,actx=null,analyser=null,raf=0,muted=false,offline=false,lastDuration=0;
const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Math.round(Number(v)||0)));
const wc=t=>(t.trim().match(/\S+/g)||[]).length;
const FILLERS=/\b(um+|uh+|er|erm|basically|actually|you know|i mean|sort of|kind of)\b/gi;

// ---------- 1. Setup ----------
function setup(){
 const u=DB.user;
 $v.innerHTML=`<div class="page-head"><div><h1>AI mock interview</h1><p>Questions are generated for your target role. Speak your answers aloud and get an AI score.</p></div></div>
 <div class="g2"><div class="card"><h2>Configure your session</h2>
  <div class="opts"><div><label for="c_role">Role you are applying for</label><select id="c_role">${Object.keys(ROLES).map(r=>`<option ${r==u.role?"selected":""}>${esc(r)}</option>`).join("")}</select></div>
  <div><label for="c_co">Company (optional)</label><input id="c_co" value="${esc(u.dream||"")}" placeholder="e.g. Google"></div>
  <div><label for="c_df">Difficulty</label><select id="c_df"><option>easy</option><option selected>medium</option><option>hard</option></select></div>
  <div><label for="c_n">Questions</label><select id="c_n"><option>3</option><option selected>5</option><option>7</option></select></div>
  <div><label for="c_lang">Speech language</label><select id="c_lang"><option value="en-IN">English (India)</option><option value="en-US">English (US)</option><option value="en-GB">English (UK)</option></select></div></div>
  ${SR?"":`<p class="err" style="margin-top:24px">This browser has no speech recognition. Please open SkillBridge in Chrome or Edge to take the voice interview.</p>`}
  <p style="margin:32px 0 0"><button class="btn lg" ${SR?"":"disabled"} onclick="begin()">Start interview</button></p></div>
 <div class="card"><h3>How it works</h3><ul class="steps">
  ${["AI reads your resume and role, then asks tailored questions","You hear each question and answer using your microphone","Gemini scores content, relevance, structure and confidence","Delivery is measured too: pace, filler words, duration"].map((t,i)=>`<li><span class="dot done">${i+1}</span><span>${t}</span></li>`).join("")}</ul>
  <p class="muted" style="margin:16px 0 0;font-size:.9rem">Tip: find a quiet room and allow microphone access when asked.</p></div></div>`;
}
async function begin(){
 cfg={role:c_role.value,company:c_co.value.trim(),difficulty:c_df.value,count:+c_n.value,lang:c_lang.value};
 const u=DB.user;idx=0;results=[];offline=false;
 $v.innerHTML=`<div class="stage"><div class="orb speak"></div><div class="q">Preparing your interview...</div><div class="state">Gemini is writing questions for ${esc(cfg.role)}</div></div>`;
 try{const j=await api("/api/interview/questions",{...cfg,skills:u.skills,resumeText:u.resumeText});qs=j.questions}
 catch(e){offline=true;const b=QUESTION_BANK[cfg.role]||QUESTION_BANK.default;qs=b.slice(0,cfg.count).map(q=>({q,type:"mixed",focus:""}));toast("AI backend unavailable, using offline mode")}
 showQ();
}

// ---------- 2. Question screen ----------
function showQ(){
 const q=qs[idx];
 $v.innerHTML=`<div class="row" style="margin-bottom:20px"><h2 style="margin:0">${esc(cfg.role)}${cfg.company?" &middot; "+esc(cfg.company):""}</h2><span class="sp"></span>${offline?'<span class="tag miss">Offline mode</span>':'<span class="tag">Gemini AI</span>'}<button class="btn alt" onclick="toggleMute()" id="mt">${muted?"Unmute voice":"Mute voice"}</button></div>
 <div class="stage"><div class="row" style="justify-content:center;margin-bottom:24px"><span class="chip">Question ${idx+1} of ${qs.length}</span><span class="chip" style="text-transform:capitalize">${esc(q.type||"general")}</span><span class="chip" id="tm">0:00</span></div>
 <div class="bar" style="max-width:420px;margin:0 auto 32px"><i style="width:${(idx/qs.length)*100}%"></i></div>
 <div class="orb" id="orb"></div><div class="q">${esc(q.q)}</div><div class="state" id="state"></div>
 <div class="wave" id="wave">${"<i></i>".repeat(28)}</div>
 <div class="transcript" id="tr"><em>Your spoken answer will appear here as you talk.</em></div>
 <div class="row" style="justify-content:center;gap:20px" id="ctl"><button class="btn alt" onclick="speak()">Replay question</button><button class="micbtn" id="mic" onclick="toggleRec()" aria-label="Start or stop recording">${MIC}</button><button class="btn alt" onclick="skipQ()">Skip</button></div></div>`;
 finalText="";interim="";speak();
}
function toggleMute(){muted=!muted;if(muted)speechSynthesis.cancel();mt.textContent=muted?"Unmute voice":"Mute voice"}
function setState(t){const s=document.getElementById("state");if(s)s.textContent=t}
function speak(){
 const orb=document.getElementById("orb");
 if(muted||!window.speechSynthesis){setState("Tap the microphone and answer aloud.");return}
 speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(qs[idx].q);u.lang=cfg.lang;u.rate=.98;
 const v=speechSynthesis.getVoices().find(x=>x.lang==cfg.lang)||speechSynthesis.getVoices().find(x=>x.lang.startsWith("en"));if(v)u.voice=v;
 u.onstart=()=>{orb&&orb.classList.add("speak");setState("Interviewer is speaking...")};
 u.onend=u.onerror=()=>{orb&&orb.classList.remove("speak");if(!recording)setState("Your turn. Tap the microphone and answer aloud.")};
 speechSynthesis.speak(u);
}

// ---------- 3. Recording (voice only) ----------
function renderTr(){const t=(finalText+" "+interim).trim();tr.innerHTML=t?esc(finalText)+(interim?` <em>${esc(interim)}</em>`:""):"<em>Listening... start speaking.</em>"}
async function startRec(){
 speechSynthesis.cancel();finalText="";interim="";
 rec=new SR();rec.continuous=true;rec.interimResults=true;rec.lang=cfg.lang;
 rec.onresult=e=>{interim="";for(let i=e.resultIndex;i<e.results.length;i++){const r=e.results[i];if(r.isFinal)finalText+=(finalText?" ":"")+r[0].transcript.trim();else interim+=r[0].transcript}renderTr()};
 rec.onerror=e=>{if(e.error=="not-allowed"||e.error=="service-not-allowed"){recording=false;resetMic();setState("Microphone blocked. Allow access in your browser's address bar and try again.")}else if(e.error=="network"){setState("Speech service needs an internet connection.")}};
 rec.onend=()=>{if(recording){try{rec.start()}catch{}}};   // Chrome stops on silence; keep listening until user taps stop
 try{rec.start()}catch{return}
 recording=true;t0=Date.now();mic.classList.add("rec");mic.innerHTML=STOP;document.getElementById("orb").className="orb listen";setState("Listening... tap the square when you are done.");renderTr();
 tick=setInterval(()=>{const s=Math.floor((Date.now()-t0)/1000);tm.textContent=Math.floor(s/60)+":"+String(s%60).padStart(2,"0")},500);
 try{stream=await navigator.mediaDevices.getUserMedia({audio:true});actx=new (window.AudioContext||window.webkitAudioContext)();analyser=actx.createAnalyser();analyser.fftSize=64;actx.createMediaStreamSource(stream).connect(analyser);draw()}catch{}
}
function draw(){const bars=[...document.querySelectorAll("#wave i")],d=new Uint8Array(analyser.frequencyBinCount);
 (function f(){if(!recording)return;analyser.getByteFrequencyData(d);bars.forEach((b,i)=>b.style.height=Math.max(6,d[i%d.length]/255*46)+"px");raf=requestAnimationFrame(f)})()}
function cleanupAudio(){clearInterval(tick);cancelAnimationFrame(raf);stream&&stream.getTracks().forEach(t=>t.stop());actx&&actx.close().catch(()=>{});stream=actx=analyser=null;document.querySelectorAll("#wave i").forEach(b=>b.style.height="6px")}
function resetMic(){cleanupAudio();const m=document.getElementById("mic");if(m){m.classList.remove("rec");m.innerHTML=MIC}const o=document.getElementById("orb");if(o)o.className="orb"}
function toggleRec(){recording?stopRec():startRec()}
function stopRec(){recording=false;lastDuration=Math.round((Date.now()-t0)/1000);try{rec.stop()}catch{}resetMic();setState("Processing your speech...");setTimeout(review,700)}
function review(){
 const text=(finalText+" "+interim).trim();finalText=text;interim="";renderTr();
 const ctl=document.getElementById("ctl");
 if(wc(text)<5){setState("I could not hear enough. Please try recording again.");return}
 setState("Happy with this answer? Submit it, or record again.");
 ctl.innerHTML=`<button class="btn alt" onclick="startRec()">Re-record</button><button class="btn lg" onclick="submit()">Submit answer</button>`;
}
function skipQ(){speechSynthesis.cancel();if(recording){recording=false;try{rec.stop()}catch{}resetMic()}results.push({q:qs[idx],answer:"",duration:0,wpm:0,fillers:0,ev:{content:0,relevance:0,structure:0,confidence:0,score:0,strengths:[],improvements:["Question skipped"],model_answer_hint:""}});next()}

// ---------- 4. Evaluation ----------
function localEval(q,answer){
 const w=wc(answer),kw=extractSkills(answer).length,tokens=new Set((q.q.toLowerCase().match(/[a-z]{5,}/g)||[])),hit=[...tokens].filter(t=>answer.toLowerCase().includes(t)).length;
 const st=(answer.match(/\b(because|for example|for instance|first|then|finally|as a result|therefore|so that)\b/gi)||[]).length,hd=(answer.match(/\b(maybe|i think|probably|not sure|i guess)\b/gi)||[]).length;
 const content=clamp(Math.min(w/90,1)*55+Math.min(kw,4)*9+8),relevance=clamp(25+Math.min(hit,4)*15+Math.min(w/60,1)*15),structure=clamp(25+Math.min(st,4)*16+Math.min(w/80,1)*10),confidence=clamp(85-hd*14-(w<30?20:0));
 return{content,relevance,structure,confidence,score:clamp(content*.4+relevance*.25+structure*.2+confidence*.15),
  strengths:[w>=70?"Gave a reasonably detailed answer":null,kw>=2?"Used relevant technical terms":null,st>=2?"Explained reasoning with connectors":null].filter(Boolean),
  improvements:[w<70?"Expand with a concrete example":null,kw<2?"Name specific tools, concepts or skills":null,st<2?"Structure it: situation, action, result":null,hd>1?"Sound more decisive, avoid hedging":null].filter(Boolean),model_answer_hint:"Offline scoring is approximate. Connect the Gemini backend for real feedback."};
}
async function submit(){
 const answer=finalText,q=qs[idx],ctl=document.getElementById("ctl");
 ctl.innerHTML='<span class="chip">Analysing with AI...</span>';setState("Scoring content, relevance, structure and confidence...");
 const mins=Math.max(lastDuration,1)/60,words=wc(answer),fillers=(answer.match(FILLERS)||[]).length;
 let ev;
 try{if(offline)throw 0;ev=await api("/api/interview/evaluate",{role:cfg.role,question:q.q,answer,durationSec:lastDuration})}
 catch{ev=localEval(q,answer);if(!offline){offline=true;toast("AI scoring failed, used offline scoring")}}
 ["content","relevance","structure","confidence","score"].forEach(k=>ev[k]=clamp(ev[k]));
 results.push({q,answer,duration:lastDuration,wpm:Math.round(words/mins),fillers,ev});next();
}
function next(){idx++;idx<qs.length?showQ():finish()}
function deliveryScore(r){const pace=r.wpm?clamp(100-Math.max(0,Math.abs(r.wpm-140)-30)*1.2):0,fr=r.answer?r.fillers/Math.max(1,wc(r.answer))*100:0;return clamp(pace*.6+(100-fr*12)*.4)}
const avg=a=>a.length?Math.round(a.reduce((s,x)=>s+x,0)/a.length):0;
async function finish(){
 speechSynthesis.cancel();
 $v.innerHTML=`<div class="stage"><div class="orb speak"></div><div class="q">Building your report...</div><div class="state">Summarising your performance</div></div>`;
 const A=results.filter(r=>r.answer),m={content:avg(A.map(r=>r.ev.content)),relevance:avg(A.map(r=>r.ev.relevance)),structure:avg(A.map(r=>r.ev.structure)),confidence:avg(A.map(r=>r.ev.confidence)),delivery:avg(A.map(deliveryScore))};
 // skipped questions count as zero so the score is honest
 const overallScore=clamp((m.content*.35+m.relevance*.2+m.structure*.15+m.confidence*.1+m.delivery*.2)*(A.length/results.length));
 let sum;
 try{if(offline||!A.length)throw 0;sum=await api("/api/interview/summary",{role:cfg.role,items:results.map(r=>({question:r.q.q,score:r.ev.score,wpm:r.wpm,fillers:r.fillers,improvements:r.ev.improvements}))})}
 catch{sum={headline:overallScore>=75?"Strong performance. You are close to interview-ready.":overallScore>=50?"Decent foundation. Tighten your answers and add examples.":"Keep practising. Focus on structure and technical depth.",strengths:[...new Set(A.flatMap(r=>r.ev.strengths))].slice(0,3),focus_areas:[...new Set(A.flatMap(r=>r.ev.improvements))].slice(0,3),next_steps:["Retake this interview after revising weak topics","Practise answering aloud with a timer","Use the STAR method for behavioural questions"]}}
 const u=DB.user;u.interviewScore=overallScore;u.interviews=[{date:Date.now(),role:cfg.role,score:overallScore,count:results.length},...(u.interviews||[])].slice(0,10);persist(u);
 report(overallScore,m,sum);
}

// ---------- 5. Report ----------
const L=(a)=>(a||[]).map(x=>`<li>${esc(x)}</li>`).join("")||"<li class=muted>None</li>";
function report(score,m,sum){
 const o=overall(DB.user),names={content:"Technical content",relevance:"Relevance",structure:"Structure",confidence:"Confidence",delivery:"Delivery (pace, fillers)"};
 $v.innerHTML=`<div class="page-head"><div><h1>Interview report</h1><p>${esc(cfg.role)}${cfg.company?" at "+esc(cfg.company):""} &middot; ${results.length} questions</p></div><span class="sp"></span><button class="btn alt" onclick="setup()">Retake</button><a class="btn" href="${o>=70?"jobs.html":"education.html"}">${o>=70?"See jobs":"Improve with courses"}</a></div>
 <div class="g2"><div class="card"><h2>${esc(sum.headline||"")}</h2><div style="margin-top:24px">${Object.keys(names).map(k=>`<div class="meter"><span>${names[k]}</span><div class="bar"><i style="width:${m[k]}%"></i></div><b>${m[k]}</b></div>`).join("")}</div>
  <p class="muted" style="margin:24px 0 0">Profile readiness is now <b style="color:var(--ink)">${o}</b> (70% skills, 30% interview).</p></div>
  <div class="card" style="display:grid;place-items:center;text-align:center">${ring(score,200)}<h3 style="margin-top:12px">Interview score</h3><span class="tag ${offline?"miss":""}">${offline?"Offline estimate":"Scored by Gemini"}</span></div></div>
 <div class="grid" style="margin-top:24px"><div class="card"><h3>Strengths</h3><ul class="muted">${L(sum.strengths)}</ul></div><div class="card"><h3>Focus areas</h3><ul class="muted">${L(sum.focus_areas)}</ul></div><div class="card"><h3>Next steps</h3><ul class="muted">${L(sum.next_steps)}</ul></div></div>
 <div class="card" style="margin-top:24px"><h2>Question by question</h2>${results.map((r,i)=>`<div class="qcard"><div class="row"><b>Q${i+1}. ${esc(r.q.q)}</b><span class="sp"></span><span class="pill ${grade(r.ev.score)}">${r.ev.score}/100</span></div>
  ${r.answer?`<blockquote>${esc(r.answer)}</blockquote><div class="row" style="margin-bottom:12px"><span class="tag ink">${r.wpm} words/min</span><span class="tag ink">${r.fillers} filler words</span><span class="tag ink">${r.duration}s</span></div>`:'<p class="muted">Skipped.</p>'}
  <div class="opts"><div><b>Went well</b><ul class="muted">${L(r.ev.strengths)}</ul></div><div><b>Improve</b><ul class="muted">${L(r.ev.improvements)}</ul></div></div>
  ${r.ev.model_answer_hint?`<p style="margin:8px 0 0"><b>A strong answer:</b> <span class="muted">${esc(r.ev.model_answer_hint)}</span></p>`:""}</div>`).join("")}</div>`;
 window.scrollTo({top:0,behavior:"smooth"});
}
if(window.speechSynthesis)speechSynthesis.getVoices();
window.addEventListener("beforeunload",()=>{try{speechSynthesis.cancel();rec&&rec.stop()}catch{}});
setup();
