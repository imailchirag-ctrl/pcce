// ===== Storage (localStorage mock; the Gemini backend is optional and used for AI features) =====
const DB={
 read(k,d){try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},
 get user(){return this.read("sb_user",null)},set user(u){localStorage.setItem("sb_user",JSON.stringify(u))},
 get users(){return this.read("sb_users",[])},set users(v){localStorage.setItem("sb_users",JSON.stringify(v))}
};
const WHATSAPP_NUMBER=""; // e.g. "919876543210" - button hidden while empty
const API_BASE=localStorage.getItem("sb_api")||(location.protocol==="file:"?"http://localhost:5000":"");
async function api(path,body,ms=45000){
 const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);
 try{const r=await fetch(API_BASE+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:c.signal});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||("HTTP "+r.status));return j}
 finally{clearTimeout(t)}
}
async function hash(s){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode("sb:"+s));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function toast(m){const t=document.createElement("div");t.className="toast";t.textContent=m;document.body.appendChild(t);setTimeout(()=>t.remove(),3200)}
function requireLogin(){if(!DB.user)location.replace("login.html")}
function logout(){localStorage.removeItem("sb_user");location.href="login.html"}
function persist(u){DB.user=u;DB.users=DB.users.map(x=>x.email==u.email?u:x)}
// ===== Skill analysis (word-boundary matching fixes false hits like "java" in "javascript", "git" in "digital") =====
const _re=s=>new RegExp("(?<![a-z0-9+#.])"+s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"(?![a-z0-9+#])","i");
function extractSkills(text){
 text=(text||"").toLowerCase();const found=new Set(SKILL_BANK.filter(s=>_re(s).test(text)));
 Object.entries(ALIASES).forEach(([a,s])=>{if(_re(a).test(text))found.add(s)});return[...found]}
function analyse(user){
 const req=ROLES[user.role]||[],t=user.resumeText||"";
 const have=[...new Set([...(user.skills||[]),...extractSkills(t)])];
 const missing=req.filter(s=>!have.includes(s));
 const m=t.match(/projects?\s*\n((?:.+\n?)+?)(?:\n\s*\n|achievements|$)/i);
 const lines=m?m[1].split("\n").filter(x=>x.trim().length>8).length:0;
 const projects=Math.max(lines,(t.match(/\bproject\b/gi)||[]).length);
 let score=req.length?Math.round(((req.length-missing.length)/req.length)*80):0;
 score+=Math.min(projects*5,20);return{have,missing,score:Math.min(score,100),projects}}
function overall(u){return u.interviewScore!=null?Math.round((u.skillScore||0)*.7+u.interviewScore*.3):(u.skillScore||0)}
function ring(v,size=190,color="var(--brand)"){const r=44,c=2*Math.PI*r;
 return`<div class="ring" style="--s:${size}px"><svg viewBox="0 0 100 100" width="${size}" height="${size}"><circle cx="50" cy="50" r="${r}" fill="none" stroke="#E9EDF4" stroke-width="9"/><circle cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c*(1-v/100)}" style="transition:stroke-dashoffset 1s"/></svg><div class="n"><b>${v}</b><small>/ 100</small></div></div>`}
function grade(v){return v>=75?"ok":v>=50?"mid":"low"}
// ===== Chrome =====
const I={
 dash:'<path d="M3 12 12 4l9 8M5 10v10h14V10"/>',resume:'<path d="M7 3h8l4 4v14H7zM14 3v5h5M10 13h6M10 17h6"/>',career:'<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
 edu:'<path d="M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5"/>',jobs:'<path d="M4 8h16v12H4zM9 8V4h6v4"/>',mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'};
const svg=p=>`<svg viewBox="0 0 24 24">${p}</svg>`;
function mountChrome(){
 const u=DB.user,cur=location.pathname.split("/").pop()||"index.html",n=document.getElementById("nav");
 const logo='<a class="brand" href="'+(u?"dashboard.html":"index.html")+'"><span class="logo">S</span>SkillBridge</a>';
 if(document.body.dataset.auth){
  requireLogin();if(!u)return;
  const L=[["dashboard.html","Dashboard","dash"],["resume.html","Resume","resume"],["career.html","Career insights","career"],["education.html","Learning","edu"],["interview.html","AI mock interview","mic"],["jobs.html","Jobs","jobs"]];
  document.body.classList.add("has-side");
  const s=document.createElement("aside");s.className="side";
  s.innerHTML=logo+"<nav>"+L.map(l=>`<a class="l ${cur==l[0]?"on":""}" href="${l[0]}">${svg(I[l[2]])}${l[1]}</a>`).join("")+`</nav><div class="me"><div class="avatar">${esc(u.name[0]||"U").toUpperCase()}</div><div><b>${esc(u.name.split(" ")[0])}</b><small>${esc(u.role)}</small></div><button class="out" title="Log out" onclick="logout()">&#x23FB;</button></div>`;
  document.body.prepend(s);if(n)n.remove();
  const b=document.createElement("button");b.className="burger";b.innerHTML="&#9776;";b.setAttribute("aria-label","Menu");b.onclick=()=>s.classList.toggle("open");document.body.prepend(b);
  const m=document.querySelector("main");if(m&&!m.querySelector(":scope>.wrap")){const w=document.createElement("div");w.className="wrap";while(m.firstChild)w.appendChild(m.firstChild);m.appendChild(w)}
 }else if(n){n.className="top";n.innerHTML=logo+'<span class="sp"></span>'+(u?'<a class="l" href="dashboard.html">Dashboard</a>':'<a class="l" href="login.html">Log in</a><a class="btn" href="signup.html">Get started</a>')}
 if(WHATSAPP_NUMBER){const w=document.createElement("a");w.id="wa";w.target="_blank";w.rel="noopener";w.title="Chat on WhatsApp";w.href=`https://wa.me/${WHATSAPP_NUMBER}?text=Hi%20SkillBridge%2C%20I%20need%20help`;
  w.innerHTML='<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm4.6 13.8c-.2.6-1.200 1.100-1.700 1.200-.5.100-1 .2-3.200-.7-2.700-1.100-4.400-3.800-4.500-4-.1-.2-1.100-1.400-1.100-2.700s.7-1.900.9-2.200c.2-.3.500-.3.700-.3h.5c.2 0 .4 0 .6.5l.8 1.900c.1.200.1.400 0 .6l-.4.500c-.2.200-.3.300-.1.600.2.300.8 1.200 1.600 2 1.100.9 2 1.300 2.300 1.400.3.100.5.100.6-.1l.9-1c.2-.3.400-.2.600-.1l1.800.9c.3.100.5.200.5.300.1.100.1.600-.1 1.200z"/></svg>';document.body.appendChild(w)}
}
document.addEventListener("DOMContentLoaded",mountChrome);
