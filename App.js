import { useState, useEffect, useRef } from "react";
import mammoth from "mammoth";

const PROFESSIONS = [
  { id: "electrician", label: "חשמלאי מוסמך", icon: "⚡", color: "#FFD93D" },
  { id: "rotating_mechanic", label: "מכונאי ציוד סובב", icon: "🔄", color: "#00C2FF" },
  { id: "machine_technician", label: "טכנאי מכונות", icon: "🔧", color: "#FF9A3C" },
  { id: "pool_operator", label: "מפעיל בריכות", icon: "💧", color: "#4ECDC4" },
  { id: "locksmith", label: "מסגר", icon: "🔩", color: "#A0AEC0" },
  { id: "welder", label: "רתך", icon: "🔥", color: "#FF6B6B" },
  { id: "plumber", label: "צנר", icon: "🪛", color: "#6BCB77" },
  { id: "mechanical_locksmith", label: "מסגר מכני", icon: "⚙️", color: "#C77DFF" },
  { id: "hr", label: "רכזת משאבי אנוש", icon: "👥", color: "#FF85A1" },
  { id: "maintenance_lead", label: "ראש צוות אחזקה", icon: "🏆", color: "#0070F3" },
  { id: "other", label: "אחר", icon: "📋", color: "#4A5568" },
];

const AGE_GROUPS = [
  { id: "all", label: "כל הגילאים" },
  { id: "18-30", label: "18–30" },
  { id: "31-45", label: "31–45" },
  { id: "46-60", label: "46–60" },
  { id: "60+", label: "60+" },
];

const EXP_GROUPS = [
  { id: "all", label: "כל הניסיון" },
  { id: "0-2", label: "0–2 שנים" },
  { id: "3-5", label: "3–5 שנים" },
  { id: "6-10", label: "6–10 שנים" },
  { id: "10+", label: "10+ שנים" },
];

const CV_PROMPT = `אתה מומחה HR. נתח קורות חיים והחזר JSON בלבד ללא backticks:
{"name":"שם","profession":"electrician/rotating_mechanic/machine_technician/pool_operator/locksmith/welder/plumber/mechanical_locksmith/hr/maintenance_lead/other","title":"תפקיד","skills":["מיומנות"],"experience_years":0,"age":null,"location":"עיר","phone":null,"email":null,"summary":"סיכום קצר בעברית","score":70}
electrician=חשמלאי, rotating_mechanic=מכונאי ציוד סובב, machine_technician=טכנאי מכונות, pool_operator=מפעיל בריכות, locksmith=מסגר, welder=רתך, plumber=צנר, mechanical_locksmith=מסגר מכני, hr=משאבי אנוש, maintenance_lead=ראש צוות אחזקה`;

const INTERVIEW_PROMPT = `אתה עוזר HR. קרא סיכום ראיון טלפוני מתמונה והחזר JSON בלבד ללא backticks:
{"summary":"טקסט הסיכום המלא","phone":null,"name":null,"email":null,"age":null,"location":null,"experience_years":null,"skills":[],"score":null,"interviewDate":null}
החזר null בשדות שלא מופיעים.`;

const getProfession = (id) => PROFESSIONS.find(p => p.id === id) || PROFESSIONS[PROFESSIONS.length - 1];
const normalizePhone = (p) => p ? p.replace(/[^0-9]/g, "") : null;
const getAgeGroup = (age) => { if (!age) return null; if (age<=30) return "18-30"; if (age<=45) return "31-45"; if (age<=60) return "46-60"; return "60+"; };
const getExpGroup = (y) => { if (y==null) return null; if (y<=2) return "0-2"; if (y<=5) return "3-5"; if (y<=10) return "6-10"; return "10+"; };

const imageToBase64 = (file) => new Promise((res, rej) => {
  const reader = new FileReader();
  reader.onload = () => res(reader.result.split(",")[1]);
  reader.onerror = rej;
  reader.readAsDataURL(file);
});

const STORAGE_KEY = "cv_scan_candidates";

export default function App() {
  const [candidates, setCandidates] = useState(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [status, setStatus] = useState(null);
  const [profFilter, setProfFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [ageFilter, setAgeFilter] = useState("all");
  const [expFilter, setExpFilter] = useState("all");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("cv_scan_apikey") || "");
  const [showApiKey, setShowApiKey] = useState(false);
  const cvInputRef = useRef(null);
  const interviewInputRef = useRef(null);
  const candidatesRef = useRef(candidates);

  useEffect(() => {
    candidatesRef.current = candidates;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(candidates)); } catch(e) {}
  }, [candidates]);

  const saveApiKey = (key) => {
    setApiKey(key);
    localStorage.setItem("cv_scan_apikey", key);
  };

  const callClaude = async (messages, system) => {
    if (!apiKey) { alert("נא להזין מפתח API של Anthropic בהגדרות"); return null; }
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system, messages }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    const raw = data.content?.[0]?.text || "{}";
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  };

  const updateCandidate = (id, updates) => setCandidates(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  const deleteCandidate = (id) => setCandidates(prev => prev.filter(c => c.id !== id));

  const showStatus = (type, message) => {
    setStatus({ type, message });
    if (type !== "loading") setTimeout(() => setStatus(null), 4000);
  };

  const processImageAsCV = async (file) => {
    showStatus("loading", "קורא קורות חיים...");
    try {
      const base64 = await imageToBase64(file);
      const ext = file.name.split(".").pop().toLowerCase();
      const mediaType = ["jpg","jpeg"].includes(ext) ? "image/jpeg" : "image/png";
      const parsed = await callClaude([{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
        { type: "text", text: "נתח קורות חיים אלו." }
      ]}], CV_PROMPT);
      if (!parsed) return;
      setCandidates(prev => [...prev, { ...parsed, id: Date.now() + Math.random(), fileName: file.name }]);
      showStatus("success", "המועמד " + (parsed.name || "") + " נוסף בהצלחה ✓");
    } catch (e) {
      showStatus("error", "שגיאה: " + e.message);
    }
  };

  const processTextAsCV = async (text, fileName) => {
    showStatus("loading", "מנתח קורות חיים...");
    try {
      const parsed = await callClaude([{ role: "user", content: `נתח קורות חיים:\n\n${text}` }], CV_PROMPT);
      if (!parsed) return;
      setCandidates(prev => [...prev, { ...parsed, id: Date.now() + Math.random(), fileName }]);
      showStatus("success", "המועמד " + (parsed.name || "") + " נוסף בהצלחה ✓");
    } catch (e) {
      showStatus("error", "שגיאה: " + e.message);
    }
  };

  const handleCVFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const ext = file.name.split(".").pop().toLowerCase();
    if (["jpg","jpeg","png","gif","webp"].includes(ext)) {
      await processImageAsCV(file);
    } else if (ext === "docx") {
      showStatus("loading", "קורא קובץ Word...");
      try {
        const buf = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buf });
        await processTextAsCV(result.value, file.name);
      } catch(e) { showStatus("error", "שגיאה בקריאת הקובץ"); }
    } else {
      const text = await file.text();
      await processTextAsCV(text, file.name);
    }
  };

  const handleInterviewFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    showStatus("loading", "קורא סיכום ראיון...");
    try {
      const base64 = await imageToBase64(file);
      const ext = file.name.split(".").pop().toLowerCase();
      const mediaType = ["jpg","jpeg"].includes(ext) ? "image/jpeg" : "image/png";
      const parsed = await callClaude([{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
        { type: "text", text: "קרא את סיכום הראיון." }
      ]}], INTERVIEW_PROMPT);
      if (!parsed) return;

      const summaryPhone = normalizePhone(parsed.phone);
      const match = summaryPhone ? candidatesRef.current.find(c => normalizePhone(c.phone) === summaryPhone) : null;

      if (match) {
        const updates = { interviewSummary: parsed.summary || "" };
        if (parsed.email && !match.email) updates.email = parsed.email;
        if (parsed.age && !match.age) updates.age = parsed.age;
        if (parsed.location && (!match.location || match.location === "לא צוין")) updates.location = parsed.location;
        if (parsed.experience_years != null && !match.experience_years) updates.experience_years = parsed.experience_years;
        if (parsed.skills?.length) updates.skills = [...new Set([...(match.skills||[]), ...parsed.skills])];
        if (parsed.score != null) updates.score = parsed.score;
        if (parsed.interviewDate && !match.interviewDate) updates.interviewDate = parsed.interviewDate;
        updateCandidate(match.id, updates);
        showStatus("success", "הסיכום שויך למועמד " + match.name + " ✓");
      } else {
        showStatus("error", "לא נמצא מועמד עם טלפון: " + (parsed.phone || "לא זוהה בסיכום"));
      }
    } catch (e) {
      showStatus("error", "שגיאה: " + e.message);
    }
  };

  const uniqueLocations = [...new Set(candidates.map(c => c.location).filter(l => l && l !== "לא צוין"))];
  const filtered = candidates.filter(c => {
    if (profFilter !== "all" && c.profession !== profFilter) return false;
    if (locationFilter !== "all" && c.location !== locationFilter) return false;
    if (ageFilter !== "all" && getAgeGroup(c.age) !== ageFilter) return false;
    if (expFilter !== "all" && getExpGroup(c.experience_years) !== expFilter) return false;
    return true;
  });
  const hasFilter = profFilter!=="all"||locationFilter!=="all"||ageFilter!=="all"||expFilter!=="all";

  const FB = ({ active, color="#00C2FF", onClick, count, children }) => (
    <button onClick={onClick} style={{ width:"100%",padding:"7px 11px",borderRadius:7,marginBottom:3,background:active?`${color}18`:"transparent",color:active?color:"#718096",fontSize:12,textAlign:"right",border:active?`1px solid ${color}40`:"1px solid transparent",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",fontFamily:"'Heebo',sans-serif" }}>
      <span style={{ background:active?color:"#1E2535",color:active?"#000":"#718096",borderRadius:4,padding:"1px 6px",fontSize:10,fontFamily:"monospace" }}>{count}</span>
      <span>{children}</span>
    </button>
  );
  const SL = ({ children }) => <div style={{ fontSize:9,color:"#4A5568",marginBottom:7,letterSpacing:2,fontFamily:"monospace" }}>// {children}</div>;
  const Div = () => <div style={{ height:1,background:"#1A2235",margin:"12px 0" }}/>;

  return (
    <div style={{ minHeight:"100vh",background:"#0A0E1A",color:"#E2E8F0",direction:"rtl",fontFamily:"monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:#0A0E1A}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:#0A0E1A}::-webkit-scrollbar-thumb{background:#2D3748;border-radius:3px}
        @keyframes slidein{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .card-in{animation:slidein 0.3s ease forwards}
        .card-h{transition:transform 0.2s,box-shadow 0.2s}.card-h:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,194,255,0.1)}
        button{cursor:pointer;font-family:inherit}
        input[type=file]{display:none}
      `}</style>

      {/* Hidden inputs */}
      <input ref={cvInputRef} type="file" accept="image/*,.pdf,.txt,.docx" capture="environment" onChange={handleCVFile} />
      <input ref={interviewInputRef} type="file" accept="image/*" capture="environment" onChange={handleInterviewFile} />

      {/* Header */}
      <header style={{ padding:"14px 20px",borderBottom:"1px solid #1E2535",display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(10,14,26,0.97)",position:"sticky",top:0,zIndex:100 }}>
        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          <div style={{ width:30,height:30,background:"linear-gradient(135deg,#00C2FF,#0070F3)",borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14 }}>⚡</div>
          <div>
            <div style={{ fontFamily:"'Heebo'",fontSize:17,fontWeight:800,background:"linear-gradient(90deg,#00C2FF,#fff)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent" }}>CV_SCAN</div>
            <div style={{ fontSize:9,color:"#4A5568" }}>// מיון קורות חיים עם AI</div>
          </div>
        </div>
        <div style={{ display:"flex",gap:14,alignItems:"center" }}>
          {[{v:candidates.length,l:"מועמדים",c:"#00C2FF"},{v:uniqueLocations.length,l:"ערים",c:"#4ECDC4"},{v:new Set(candidates.map(c=>c.profession).filter(Boolean)).size,l:"מקצועות",c:"#FFD93D"}].map((s,i)=>(
            <div key={i} style={{ textAlign:"center" }}>
              <div style={{ fontSize:16,fontWeight:700,color:s.c,fontFamily:"'Heebo'" }}>{s.v}</div>
              <div style={{ fontSize:9,color:"#4A5568" }}>{s.l}</div>
            </div>
          ))}
          <button onClick={()=>setShowApiKey(v=>!v)} style={{ background:"rgba(255,255,255,0.05)",border:"1px solid #2D3748",borderRadius:7,padding:"6px 10px",color:"#718096",fontSize:11,fontFamily:"'Heebo'" }}>⚙️ הגדרות</button>
        </div>
      </header>

      {/* API Key panel */}
      {showApiKey && (
        <div style={{ background:"#0D1120",borderBottom:"1px solid #1E2535",padding:"12px 20px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap" }}>
          <span style={{ fontSize:12,color:"#718096",fontFamily:"'Heebo'" }}>🔑 Anthropic API Key:</span>
          <input type="password" value={apiKey} onChange={e=>saveApiKey(e.target.value)} placeholder="sk-ant-..."
            style={{ flex:1,minWidth:200,background:"#0A0E1A",border:"1px solid #2D3748",borderRadius:7,color:"#E2E8F0",fontSize:12,padding:"6px 10px",outline:"none",fontFamily:"monospace" }}/>
          <a href="https://console.anthropic.com/keys" target="_blank" rel="noreferrer" style={{ fontSize:11,color:"#00C2FF",fontFamily:"'Heebo'" }}>קבל מפתח ←</a>
          {apiKey && <span style={{ fontSize:11,color:"#6BCB77",fontFamily:"'Heebo'" }}>✓ מפתח נשמר</span>}
        </div>
      )}

      <div style={{ display:"flex",minHeight:"calc(100vh - 57px)" }}>

        {/* Sidebar */}
        <aside style={{ width:225,borderLeft:"1px solid #1E2535",padding:"16px 12px",flexShrink:0,background:"#0D1120",overflowY:"auto" }}>
          <SL>מקצוע</SL>
          <FB active={profFilter==="all"} onClick={()=>setProfFilter("all")} count={candidates.length}>הכל</FB>
          {PROFESSIONS.map(p=>{ const cnt=candidates.filter(c=>c.profession===p.id).length; if(cnt===0&&candidates.length>0)return null; return <FB key={p.id} active={profFilter===p.id} color={p.color} onClick={()=>setProfFilter(p.id)} count={cnt}>{p.icon} {p.label}</FB>; })}
          <Div/>
          <SL>מיקום מגורים</SL>
          <FB active={locationFilter==="all"} color="#4ECDC4" onClick={()=>setLocationFilter("all")} count={candidates.length}>📍 הכל</FB>
          {uniqueLocations.map(loc=><FB key={loc} active={locationFilter===loc} color="#4ECDC4" onClick={()=>setLocationFilter(loc)} count={candidates.filter(c=>c.location===loc).length}>📍 {loc}</FB>)}
          <Div/>
          <SL>גיל</SL>
          {AGE_GROUPS.map(ag=>{ const cnt=ag.id==="all"?candidates.length:candidates.filter(c=>getAgeGroup(c.age)===ag.id).length; return <FB key={ag.id} active={ageFilter===ag.id} color="#FF85A1" onClick={()=>setAgeFilter(ag.id)} count={cnt}>🎂 {ag.label}</FB>; })}
          <Div/>
          <SL>שנות ניסיון</SL>
          {EXP_GROUPS.map(eg=>{ const cnt=eg.id==="all"?candidates.length:candidates.filter(c=>getExpGroup(c.experience_years)===eg.id).length; return <FB key={eg.id} active={expFilter===eg.id} color="#C77DFF" onClick={()=>setExpFilter(eg.id)} count={cnt}>⏱ {eg.label}</FB>; })}
          {hasFilter&&<button onClick={()=>{setProfFilter("all");setLocationFilter("all");setAgeFilter("all");setExpFilter("all");}} style={{ width:"100%",padding:"6px",borderRadius:7,marginTop:8,background:"rgba(255,107,107,0.1)",border:"1px solid rgba(255,107,107,0.3)",color:"#FF6B6B",fontSize:11,fontFamily:"'Heebo'" }}>✕ נקה סינונים</button>}
          <Div/>
          <button onClick={()=>{ if(window.confirm("למחוק את כל המועמדים?")){ setCandidates([]); try{localStorage.removeItem(STORAGE_KEY);}catch(e){} } }} style={{ width:"100%",padding:"6px",borderRadius:7,background:"rgba(255,60,60,0.07)",border:"1px solid rgba(255,60,60,0.2)",color:"#E53E3E",fontSize:11,fontFamily:"'Heebo'" }}>🗑 מחק את כל המועמדים</button>
        </aside>

        {/* Main */}
        <main style={{ flex:1,padding:18,overflowY:"auto" }}>

          {/* Big buttons */}
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:18 }}>
            <button onClick={()=>cvInputRef.current?.click()}
              style={{ background:"linear-gradient(135deg,rgba(0,194,255,0.12),rgba(0,112,243,0.08))",border:"2px solid rgba(0,194,255,0.35)",borderRadius:14,padding:"20px 14px",textAlign:"center",transition:"all 0.2s" }}
              onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(0,194,255,0.75)"}
              onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(0,194,255,0.35)"}>
              <div style={{ fontSize:34,marginBottom:7 }}>📄</div>
              <div style={{ fontFamily:"'Heebo'",fontSize:15,fontWeight:700,color:"#00C2FF",marginBottom:3 }}>צלם קורות חיים</div>
              <div style={{ fontSize:11,color:"#4A5568",fontFamily:"'Heebo'" }}>תמונה · Word · PDF · טקסט</div>
            </button>
            <button onClick={()=>interviewInputRef.current?.click()}
              style={{ background:"linear-gradient(135deg,rgba(255,200,80,0.12),rgba(255,154,60,0.08))",border:"2px solid rgba(255,200,80,0.35)",borderRadius:14,padding:"20px 14px",textAlign:"center",transition:"all 0.2s" }}
              onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(255,200,80,0.75)"}
              onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(255,200,80,0.35)"}>
              <div style={{ fontSize:34,marginBottom:7 }}>📋</div>
              <div style={{ fontFamily:"'Heebo'",fontSize:15,fontWeight:700,color:"#FFC850",marginBottom:3 }}>צלם סיכום ראיון</div>
              <div style={{ fontSize:11,color:"#4A5568",fontFamily:"'Heebo'" }}>יותאם אוטומטית לפי טלפון</div>
            </button>
          </div>

          {/* Status */}
          {status&&(
            <div style={{ padding:"10px 14px",borderRadius:9,marginBottom:14,display:"flex",alignItems:"center",gap:10,
              background:status.type==="loading"?"rgba(0,194,255,0.08)":status.type==="success"?"rgba(107,203,119,0.1)":"rgba(255,107,107,0.1)",
              border:`1px solid ${status.type==="loading"?"rgba(0,194,255,0.3)":status.type==="success"?"rgba(107,203,119,0.3)":"rgba(255,107,107,0.3)"}` }}>
              {status.type==="loading"?<div style={{ width:14,height:14,border:"2px solid #00C2FF",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite",flexShrink:0 }}/>:<span>{status.type==="success"?"✅":"❌"}</span>}
              <span style={{ fontFamily:"'Heebo'",fontSize:13,color:status.type==="loading"?"#00C2FF":status.type==="success"?"#6BCB77":"#FF6B6B" }}>{status.message}</span>
            </div>
          )}

          {candidates.length>0&&<div style={{ fontSize:10,color:"#4A5568",marginBottom:12 }}>// מציג {filtered.length} מתוך {candidates.length} מועמדים</div>}

          {filtered.length===0?(
            <div style={{ textAlign:"center",padding:"48px 0",color:"#2D3748" }}>
              <div style={{ fontSize:40,marginBottom:10 }}>📷</div>
              <div style={{ fontFamily:"'Heebo'",fontSize:15,fontWeight:600,color:"#4A5568",marginBottom:5 }}>לחץ על אחד הכפתורים למעלה</div>
              <div style={{ fontSize:12,color:"#2D3748",fontFamily:"'Heebo'" }}>צלם קורות חיים או סיכום ראיון</div>
            </div>
          ):(
            <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))",gap:13 }}>
              {filtered.map(c=>{
                const prof=getProfession(c.profession);
                return (
                  <div key={c.id} className="card-h card-in" style={{ background:"#0D1120",border:"1px solid #1E2535",borderRadius:12,padding:15,position:"relative",overflow:"hidden" }}>
                    <div style={{ position:"absolute",top:0,right:0,width:4,height:"100%",background:prof.color,borderRadius:"0 12px 12px 0" }}/>
                    <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:9 }}>
                      <div style={{ flex:1,paddingLeft:5 }}>
                        <div style={{ display:"flex",gap:4,flexWrap:"wrap",marginBottom:5 }}>
                          <span style={{ background:`${prof.color}15`,border:`1px solid ${prof.color}28`,borderRadius:20,padding:"2px 8px",fontSize:10,color:prof.color,fontFamily:"'Heebo'" }}>{prof.icon} {prof.label}</span>
                          {c.interviewSummary&&<span style={{ background:"rgba(107,203,119,0.1)",border:"1px solid rgba(107,203,119,0.25)",borderRadius:20,padding:"2px 8px",fontSize:10,color:"#6BCB77",fontFamily:"'Heebo'" }}>📋 רואיין</span>}
                        </div>
                        <div style={{ fontFamily:"'Heebo'",fontSize:15,fontWeight:700,color:"#E2E8F0" }}>{c.name||"מועמד לא ידוע"}</div>
                        <div style={{ fontSize:11,color:"#718096",marginTop:1 }}>{c.title}</div>
                      </div>
                      <div style={{ width:40,height:40,borderRadius:"50%",border:`2px solid ${prof.color}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                        <div style={{ fontSize:12,fontWeight:700,color:prof.color,lineHeight:1 }}>{c.score??"-"}</div>
                        <div style={{ fontSize:7,color:"#4A5568" }}>ציון</div>
                      </div>
                    </div>
                    <div style={{ display:"flex",gap:5,flexWrap:"wrap",marginBottom:8 }}>
                      {c.location&&c.location!=="לא צוין"&&<span style={{ background:"rgba(78,205,196,0.08)",border:"1px solid rgba(78,205,196,0.2)",borderRadius:20,padding:"2px 8px",fontSize:10,color:"#4ECDC4",fontFamily:"'Heebo'" }}>📍 {c.location}</span>}
                      {c.age&&<span style={{ background:"rgba(255,133,161,0.08)",border:"1px solid rgba(255,133,161,0.2)",borderRadius:20,padding:"2px 8px",fontSize:10,color:"#FF85A1",fontFamily:"'Heebo'" }}>🎂 גיל {c.age}</span>}
                      {c.experience_years!=null&&<span style={{ background:"rgba(199,125,255,0.08)",border:"1px solid rgba(199,125,255,0.2)",borderRadius:20,padding:"2px 8px",fontSize:10,color:"#C77DFF",fontFamily:"'Heebo'" }}>⏱ {c.experience_years} שנ'</span>}
                    </div>
                    {c.summary&&<p style={{ fontSize:11,color:"#718096",lineHeight:1.6,marginBottom:8,fontFamily:"'Heebo'" }}>{c.summary}</p>}
                    {c.skills?.length>0&&<div style={{ display:"flex",flexWrap:"wrap",gap:4,marginBottom:8 }}>{c.skills.slice(0,5).map((s,i)=><span key={i} style={{ background:"#1A2035",border:"1px solid #2D3748",borderRadius:4,padding:"2px 6px",fontSize:9,color:"#A0AEC0" }}>{s}</span>)}</div>}
                    {(c.phone||c.email)&&(
                      <div style={{ display:"flex",flexDirection:"column",gap:4,marginBottom:8,padding:"7px 8px",background:"#0A0E1A",borderRadius:7,border:"1px solid #1A2235" }}>
                        {c.phone&&<a href={"tel:"+c.phone} style={{ fontSize:11,color:"#6BCB77",textDecoration:"none" }}>📞 {c.phone}</a>}
                        {c.email&&<a href={"mailto:"+c.email} style={{ fontSize:11,color:"#00C2FF",textDecoration:"none" }}>✉️ {c.email}</a>}
                      </div>
                    )}
                    <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:7 }}>
                      <span style={{ fontSize:10,color:"#718096",fontFamily:"'Heebo'",whiteSpace:"nowrap" }}>📅 ראיון:</span>
                      <input type="date" value={c.interviewDate||""} onChange={e=>updateCandidate(c.id,{interviewDate:e.target.value})}
                        style={{ background:"#0A0E1A",border:"1px solid #2D3748",borderRadius:5,color:c.interviewDate?"#E2E8F0":"#4A5568",fontSize:10,padding:"2px 5px",outline:"none",flex:1,fontFamily:"monospace",display:"block" }}/>
                    </div>
                    {c.interviewSummary&&(
                      <div style={{ marginBottom:8,padding:"7px 8px",background:"rgba(255,200,80,0.05)",border:"1px solid rgba(255,200,80,0.18)",borderRadius:7 }}>
                        <div style={{ fontSize:10,color:"#FFC850",marginBottom:3,fontFamily:"'Heebo'",fontWeight:600 }}>📋 סיכום ראיון</div>
                        <p style={{ fontSize:11,color:"#A0AEC0",lineHeight:1.6,fontFamily:"'Heebo'",whiteSpace:"pre-wrap" }}>{c.interviewSummary}</p>
                      </div>
                    )}
                    <div style={{ borderTop:"1px solid #1E2535",paddingTop:8,display:"flex",justifyContent:"flex-end" }}>
                      <button onClick={()=>{ if(window.confirm("למחוק את "+(c.name||"המועמד")+"?")) deleteCandidate(c.id); }}
                        style={{ background:"transparent",border:"none",color:"#4A5568",fontSize:13,padding:"2px 5px",borderRadius:4 }}
                        onMouseEnter={e=>{e.currentTarget.style.color="#FF6B6B";e.currentTarget.style.background="rgba(255,107,107,0.1)"}}
                        onMouseLeave={e=>{e.currentTarget.style.color="#4A5568";e.currentTarget.style.background="transparent"}}
                      >🗑</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
