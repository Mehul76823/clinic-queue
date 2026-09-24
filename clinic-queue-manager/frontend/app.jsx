const { useState, useEffect, useCallback } = React;
const ST = { SCHEDULED: 'Scheduled', WAITING: 'Waiting', IN_CONSULT: 'In Consult', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };
const FLOW = ['SCHEDULED', 'WAITING', 'IN_CONSULT', 'COMPLETED'];
const api = (p, b, m) => fetch('/api/' + p, { method: b !== undefined ? (m || 'POST') : 'GET', headers: { 'Content-Type': 'application/json', ...(sessionStorage.tok ? { Authorization: 'Bearer ' + sessionStorage.tok } : {}) }, body: b !== undefined ? JSON.stringify(b) : undefined })
  .then(async r => { const d = await r.json(); if (r.status === 401 && sessionStorage.tok) { sessionStorage.removeItem('tok'); window.dispatchEvent(new Event('logout')); } if (!r.ok) throw new Error(d.error); return d; });
const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const nextDays = n => Array.from({ length: n }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return { v: iso(d), l: i === 0 ? 'Today' : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) }; });
const initials = n => n.replace('Dr. ', '').split(' ').map(w => w[0]).slice(0, 2).join('');
const Badge = ({ s }) => <span className={'badge ' + s}>{ST[s]}</span>;
const fmt = m => m < 1 ? 'Your turn is next' : m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m + ' min';
function usePoll(fn, ms = 3000) { useEffect(() => { fn(); const t = setInterval(fn, ms); return () => clearInterval(t); }, [fn]); }
function Toast({ t }) { return t ? <div className={'toast ' + (t.ok ? 'ok' : '')} role="alert">{t.m}</div> : null; }
function useToast() { const [t, set] = useState(null); const show = (m, ok) => { set({ m, ok }); setTimeout(() => set(null), 3500); }; return [t, show]; }

function SlotPicker({ doctorId, date, value, onPick }) {
  const [slots, setSlots] = useState([]);
  const load = useCallback(() => api(`doctors/${doctorId}/slots?date=${date}`).then(setSlots).catch(() => {}), [doctorId, date]);
  usePoll(load, 5000);
  return <div className="slots">{slots.map(s => <button key={s.time} disabled={!s.available} className={'chip ' + (value === s.time ? 'on' : '')} onClick={() => onPick(s.time)}>{s.time}</button>)}</div>;
}

function Tracker({ a }) {
  const idx = FLOW.indexOf(a.status);
  return (<div className="card" style={{ padding: 20 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><div><b>{a.patient}</b><div className="muted">{a.doctorName} · {a.date} at {a.time} · #{a.id}</div></div><Badge s={a.status} /></div>
    {a.status === 'CANCELLED' ? <p className="muted">This appointment was cancelled. Book a new slot any time.</p> :
      <div className="steps">{FLOW.map((s, i) => <div key={s} className={'step ' + (i < idx ? 'done' : i === idx ? 'now' : '')}>{ST[s]}</div>)}</div>}
    {a.waitMins !== undefined && <div className="wait"><div><div className="muted">Queue position</div><b>#{a.position}</b></div><div style={{ textAlign: 'right' }}><div className="muted">Estimated wait</div><b>{fmt(a.waitMins)}</b></div></div>}
    {a.status === 'COMPLETED' && <div className="rx"><b>Doctor's notes and prescription</b><br />{a.notes || 'No notes were added.'}</div>}
  </div>);
}

function MyAppointments({ ids }) {
  const [list, setList] = useState([]);
  const load = useCallback(() => Promise.all(ids.map(i => api('appointments/' + i).catch(() => null))).then(r => setList(r.filter(Boolean))), [ids.join()]);
  usePoll(load);
  return (<div><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 12px' }}><h2 style={{ fontSize: 24 }}>Your appointments</h2><span className="live">Live status</span></div>
    {list.length === 0 ? <div className="card muted">No appointments yet. Choose a doctor above and book a slot, or look one up with your booking ID.</div> :
      <div className="grid g4" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))' }}>{list.map(a => <Tracker key={a.id} a={a} />)}</div>}</div>);
}

function Patient() {
  const [docs, setDocs] = useState([]), [doc, setDoc] = useState(null), [date, setDate] = useState(iso(new Date())), [time, setTime] = useState('');
  const [f, setF] = useState({ patient: '', phone: '', reason: '' }), [busy, setBusy] = useState(false), [toast, show] = useToast(), [lookup, setLookup] = useState('');
  const [ids, setIds] = useState(() => JSON.parse(localStorage.getItem('apts') || '[]'));
  useEffect(() => { api('doctors').then(d => { setDocs(d); setDoc(d[0]); }); }, []);
  useEffect(() => localStorage.setItem('apts', JSON.stringify(ids)), [ids]);
  const book = () => { setBusy(true); api('appointments', { ...f, doctorId: doc.id, date, time })
    .then(a => { setIds([a.id, ...ids]); setTime(''); setF({ patient: '', phone: '', reason: '' }); show(`Booked with ${a.doctorName} at ${a.time}. Booking ID: ${a.id}`, true); })
    .catch(e => { show(e.message); setTime(''); }).finally(() => setBusy(false)); };
  const track = () => api('appointments/' + lookup.trim()).then(a => { setIds(ids.includes(a.id) ? ids : [a.id, ...ids]); setLookup(''); }).catch(e => show(e.message));
  return (<>
    <header className="hero"><div><h1>See a doctor without the waiting-room guesswork.</h1><p>Pick a doctor, choose a free slot, and follow your place in the queue live from your phone.</p></div></header>
    <div className="wrap pull"><div className="grid g2">
      <div className="card"><h2 style={{ fontSize: 24 }}>Book an appointment</h2>
        <label>1. Choose a doctor</label>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))' }}>{docs.map(d => <button key={d.id} className={'doc ' + (doc && doc.id === d.id ? 'on' : '')} onClick={() => { setDoc(d); setTime(''); }}><span className="av">{initials(d.name)}</span><span><b>{d.name}</b><small>{d.specialty}</small><small>{d.experience} yrs · {d.qualification}</small><small>Consultation fee ₹{d.fee}</small></span></button>)}</div>
        {doc && <p className="muted" style={{ margin: '12px 0 0' }}>{doc.about}</p>}
        <label>2. Pick a date</label>
        <div className="dates">{nextDays(7).map(d => <button key={d.v} className={'chip ' + (date === d.v ? 'on' : '')} onClick={() => { setDate(d.v); setTime(''); }}>{d.l}</button>)}</div>
        <label>3. Pick a time <span className="muted">(struck-through slots are taken)</span></label>
        {doc && <SlotPicker doctorId={doc.id} date={date} value={time} onPick={setTime} />}
      </div>
      <div className="card"><h2 style={{ fontSize: 24 }}>Your details</h2>
        <label>Full name</label><input value={f.patient} onChange={e => setF({ ...f, patient: e.target.value })} placeholder="e.g. Riya Sharma" />
        <label>Mobile number</label><input value={f.phone} inputMode="numeric" maxLength={10} onChange={e => setF({ ...f, phone: e.target.value.replace(/\D/g, '') })} placeholder="10-digit number" />
        <label>Reason for visit</label><textarea rows={3} value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} placeholder="Briefly describe your symptoms" />
        <p className="muted" style={{ margin: '14px 0' }}>{doc && time ? `${doc.name} · ${date} at ${time} · Fee ₹${doc.fee}, paid at the clinic` : 'Select a doctor, date and time first.'}</p>
        <button className="btn" style={{ width: '100%' }} disabled={busy || !time || !f.patient || f.phone.length !== 10} onClick={book}>Confirm booking</button>
      </div></div>
      <div style={{ marginTop: 40 }}><div className="card" style={{ display: 'flex', gap: 10, alignItems: 'end', marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}><label style={{ marginTop: 0 }}>Track an appointment by booking ID</label><input value={lookup} onChange={e => setLookup(e.target.value)} placeholder="e.g. A1004" onKeyDown={e => e.key === 'Enter' && track()} /></div>
        <button className="btn" onClick={track} disabled={!lookup}>Track</button></div>
        <MyAppointments ids={ids} /></div>
      <Info />
    </div><ChatBot docs={docs} /><Toast t={toast} /></>);
}

function Modal({ children, onClose }) { return <div className="modal" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="card">{children}</div></div>; }

function StaffBoard({ user, onLogout }) {
  const [rows, setRows] = useState([]), [docs, setDocs] = useState([]), [df, setDf] = useState(''), [toast, show] = useToast(), [modal, setModal] = useState(null);
  const [notes, setNotes] = useState(''), [rd, setRd] = useState({ date: iso(new Date()), time: '' });
  useEffect(() => { api('doctors').then(setDocs); }, []);
  const load = useCallback(() => api('queue' + (df ? '?doctorId=' + df : '')).then(setRows).catch(() => {}), [df]);
  usePoll(load);
  const run = (p, b, m, done) => api(p, b, m).then(() => { load(); done && show(done, true); setModal(null); }).catch(e => show(e.message));
  const count = s => rows.filter(r => r.status === s).length;
  const dn = id => (docs.find(d => d.id === id) || {}).name;
  return (<div className="wrap">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', flexWrap: 'wrap', gap: 12 }}>
      <div><h1 style={{ fontSize: 34 }}>Today's queue</h1><div className="muted">{new Date().toLocaleDateString('en-IN', { dateStyle: 'full' })} · <span className="live">Auto-refreshing</span></div></div>
      <div className="acts" style={{ alignItems: 'center' }}><span className="muted">Signed in as {user}</span><button className="btn sm ghost" onClick={onLogout}>Sign out</button></div>
      <select style={{ width: 220 }} value={df} onChange={e => setDf(e.target.value)}><option value="">All doctors</option>{docs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
    <div className="stats">{[['SCHEDULED', 'Scheduled'], ['WAITING', 'In waiting room'], ['IN_CONSULT', 'With doctor'], ['COMPLETED', 'Completed']].map(([s, l]) => <div className="stat" key={s}><b>{count(s)}</b><span className="muted">{l}</span></div>)}</div>
    <div className="tw"><table><thead><tr><th>Time</th><th>Patient</th><th>Doctor</th><th>Status</th><th>Wait</th><th>Actions</th></tr></thead><tbody>
      {rows.length === 0 && <tr><td colSpan="6" className="muted">No appointments for today.</td></tr>}
      {rows.map(r => <tr key={r.id} className={r.status === 'CANCELLED' ? 'dim' : ''}>
        <td><b>{r.time}</b></td><td><b>{r.patient}</b><div className="muted" style={{ fontSize: 13 }}>{r.reason || '-'} · #{r.id} · {r.phone}</div></td><td>{r.doctorName}</td><td><Badge s={r.status} /></td>
        <td>{r.waitMins !== undefined ? (r.waitMins === 0 ? 'Next' : r.waitMins + ' min') : '-'}</td>
        <td><div className="acts">
          {r.status === 'SCHEDULED' && <button className="btn sm" onClick={() => run(`appointments/${r.id}/status`, { status: 'WAITING' }, 'POST', r.patient + ' checked in')}>Check in</button>}
          {r.status === 'WAITING' && <button className="btn sm" onClick={() => run(`appointments/${r.id}/status`, { status: 'IN_CONSULT' }, 'POST', 'Consultation started')}>Start consult</button>}
          {r.status === 'IN_CONSULT' && <button className="btn sm" onClick={() => { setNotes(''); setModal({ t: 'done', r }); }}>Complete</button>}
          {r.status === 'COMPLETED' && <button className="btn sm ghost" onClick={() => { setNotes(r.notes); setModal({ t: 'notes', r }); }}>{r.notes ? 'Edit notes' : 'Add notes'}</button>}
          {r.status === 'SCHEDULED' && <button className="btn sm ghost" onClick={() => { setRd({ date: iso(new Date()), time: '' }); setModal({ t: 'rs', r }); }}>Reschedule</button>}
          {(r.status === 'SCHEDULED' || r.status === 'WAITING') && <button className="btn sm red" onClick={() => confirm('Cancel ' + r.patient + "'s appointment?") && run(`appointments/${r.id}/cancel`, {}, 'POST', 'Appointment cancelled')}>Cancel</button>}
        </div></td></tr>)}
    </tbody></table></div>
    {modal && (modal.t === 'rs' ? <Modal onClose={() => setModal(null)}><h2 style={{ fontSize: 22 }}>Reschedule {modal.r.patient}</h2><p className="muted">{dn(modal.r.doctorId)} · currently {modal.r.date} at {modal.r.time}</p>
      <label>New date</label><div className="dates">{nextDays(7).map(d => <button key={d.v} className={'chip ' + (rd.date === d.v ? 'on' : '')} onClick={() => setRd({ date: d.v, time: '' })}>{d.l}</button>)}</div>
      <label>New time</label><SlotPicker doctorId={modal.r.doctorId} date={rd.date} value={rd.time} onPick={t => setRd({ ...rd, time: t })} />
      <div className="acts" style={{ marginTop: 20 }}><button className="btn" disabled={!rd.time} onClick={() => run(`appointments/${modal.r.id}/reschedule`, rd, 'POST', 'Appointment rescheduled')}>Save new time</button><button className="btn ghost" onClick={() => setModal(null)}>Close</button></div></Modal>
      : <Modal onClose={() => setModal(null)}><h2 style={{ fontSize: 22 }}>{modal.t === 'done' ? 'Complete consultation' : 'Notes'} for {modal.r.patient}</h2>
        <label>Prescription and notes</label><textarea rows={6} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Diagnosis, medicines, dosage, follow-up advice" />
        <div className="acts" style={{ marginTop: 20 }}><button className="btn" onClick={() => modal.t === 'done' ? run(`appointments/${modal.r.id}/status`, { status: 'COMPLETED', notes }, 'POST', 'Consultation completed') : run(`appointments/${modal.r.id}/notes`, { notes }, 'PUT', 'Notes saved')}>{modal.t === 'done' ? 'Mark completed' : 'Save notes'}</button><button className="btn ghost" onClick={() => setModal(null)}>Close</button></div></Modal>)}
    <Toast t={toast} /></div>);
}

function Login({ onIn }) {
  const [f, setF] = useState({ username: '', password: '' }), [err, setErr] = useState('');
  const go = e => { e.preventDefault(); api('login', f).then(r => { sessionStorage.tok = r.token; sessionStorage.user = r.username; onIn(r.username); }).catch(x => setErr(x.message)); };
  return (<div className="wrap" style={{ maxWidth: 460, paddingTop: 72 }}><form className="card" onSubmit={go}>
    <h1 style={{ fontSize: 30 }}>Staff sign in</h1><p className="muted">For clinic staff only. Patients can book from the Patient portal.</p>
    <label>Username</label><input autoFocus autoComplete="username" value={f.username} onChange={e => setF({ ...f, username: e.target.value })} />
    <label>Password</label><input type="password" autoComplete="current-password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} />
    {err && <p style={{ color: 'var(--red)', fontWeight: 600, margin: '14px 0 0' }} role="alert">{err}</p>}
    <button className="btn" style={{ width: '100%', marginTop: 18 }} disabled={!f.username || !f.password}>Sign in</button></form></div>);
}
function Staff() {
  const [user, setUser] = useState(() => sessionStorage.tok ? sessionStorage.user : null);
  useEffect(() => { const f = () => setUser(null); window.addEventListener('logout', f); return () => window.removeEventListener('logout', f); }, []);
  const out = () => { sessionStorage.removeItem('tok'); sessionStorage.removeItem('user'); setUser(null); };
  return user ? <StaffBoard user={user} onLogout={out} /> : <Login onIn={setUser} />;
}

const KEYS = { heart: 2, cardio: 2, bp: 2, 'blood pressure': 2, child: 3, kid: 3, baby: 3, pediatric: 3, skin: 4, derma: 4, acne: 4, rash: 4, hair: 4, fever: 1, cold: 1, cough: 1, general: 1, physician: 1 };
async function answer(q, docs) {
  const t = q.toLowerCase(), id = q.match(/\bA\d{4,}\b/i);
  if (/emergency|ambulance|severe|unconscious|can't breathe|bleeding heavily/.test(t)) return 'If this is an emergency, call 108 or go to the nearest hospital now. This clinic does not handle emergencies.';
  if (id) { try { const a = await api('appointments/' + id[0].toUpperCase()); return `${a.patient}: ${a.doctorName}, ${a.date} at ${a.time}.\nStatus: ${ST[a.status]}.` + (a.waitMins !== undefined ? `\nQueue position #${a.position}, estimated wait ${fmt(a.waitMins)}.` : '') + (a.status === 'COMPLETED' ? '\nOpen "Your appointments" on this page to read your notes.' : ''); } catch (e) { return e.message + '. Check the booking ID and try again.'; } }
  const byName = docs.find(d => d.name.toLowerCase().replace('dr. ', '').split(' ').some(w => w.length > 2 && t.includes(w)));
  const key = Object.keys(KEYS).find(k => t.includes(k));
  const d = byName || (key && docs.find(x => x.id === KEYS[key]));
  if (d && /slot|free|avail|time|book|appoint/.test(t)) {
    const sl = (await api(`doctors/${d.id}/slots?date=${iso(new Date())}`)).filter(x => x.available).map(x => x.time);
    return sl.length ? `${d.name} has ${sl.length} free slots today: ${sl.slice(0, 8).join(', ')}${sl.length > 8 ? ' and more' : ''}.\nPick one in the booking form above.` : `${d.name} is fully booked today. Try another date in the booking form.`;
  }
  if (d) return `${d.name}, ${d.specialty}. ${d.experience} years of experience, ${d.qualification}.\n${d.about}\nConsultation fee ₹${d.fee}.`;
  if (/fee|cost|price|charge|pay/.test(t)) return docs.map(x => `${x.name}: ₹${x.fee}`).join('\n') + '\nFees are paid at the clinic after your visit.';
  if (/doctor|specialist|who|specialty|speciality/.test(t)) return docs.map(x => `${x.name} (${x.specialty})`).join('\n') + '\nAsk about any of them for details or free slots.';
  if (/hour|open|timing|close|lunch|when/.test(t)) return 'The clinic is open daily from 9:00 to 17:00. Lunch break is 13:00 to 14:00. Each visit is a 20-minute slot.';
  if (/cancel|reschedule|change|move/.test(t)) return 'Ask the front desk to cancel or reschedule before you are called in. Call 0141-400-0000 or visit the clinic.';
  if (/wait|queue|status|track|position/.test(t)) return 'Send me your booking ID (for example A1004) and I will check your status and estimated wait.';
  if (/how|book|steps/.test(t)) return '1. Choose a doctor and date above.\n2. Pick a free time slot.\n3. Enter your name and mobile number, then tap Confirm booking.\nYou get a booking ID to track your queue live.';
  if (/^(hi|hello|hey|namaste)/.test(t)) return 'Hello! Ask me about doctors, free slots, fees, clinic hours, or send a booking ID to check your queue status.';
  return 'I can help with doctors, free slots, fees, clinic hours and queue status. Try: "Free slots for a cardiologist" or send a booking ID like A1004.';
}
function ChatBot({ docs }) {
  const [open, setOpen] = useState(false), [txt, setTxt] = useState(''), [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState([{ r: 'bot', t: 'Hi, I am the CarePoint assistant. I can find a doctor, check free slots today, share fees and hours, or track your booking ID.' }]);
  const end = React.useRef(null);
  useEffect(() => { end.current && end.current.scrollIntoView({ block: 'end' }); }, [msgs, open]);
  const send = async q => { if (!q.trim() || busy) return; setBusy(true); setTxt(''); setMsgs(m => [...m, { r: 'me', t: q }]);
    const a = await answer(q, docs).catch(() => 'Something went wrong. Please try again.'); setMsgs(m => [...m, { r: 'bot', t: a }]); setBusy(false); };
  if (!open) return <button className="fab" onClick={() => setOpen(true)} aria-label="Open chat assistant">Ask CarePoint</button>;
  return (<div className="chat" role="dialog" aria-label="CarePoint assistant">
    <header><b>CarePoint assistant</b><button className="btn sm ghost" onClick={() => setOpen(false)}>Close</button></header>
    <div className="log">{msgs.map((m, i) => <div key={i} className={'msg ' + m.r}>{m.t}</div>)}{busy && <div className="msg bot muted">Typing...</div>}<div ref={end} /></div>
    <div className="quick">{['Which doctors are available?', 'Free slots for a cardiologist', 'Clinic timings', 'How do I book?'].map(q => <button key={q} className="chip" onClick={() => send(q)}>{q}</button>)}</div>
    <form onSubmit={e => { e.preventDefault(); send(txt); }}><input value={txt} onChange={e => setTxt(e.target.value)} placeholder="Type a question or booking ID" /><button className="btn" disabled={!txt.trim() || busy}>Send</button></form></div>);
}
function Info() {
  const faq = [['Do I pay online?', 'No. Pay the consultation fee at the front desk after your visit.'], ['When should I arrive?', 'Arrive 10 minutes early and give your booking ID at the front desk so staff can add you to the live queue.'], ['Can I change my slot?', 'Yes. Ask the front desk to reschedule or cancel before you are called in.'], ['How is the wait time worked out?', 'We count patients ahead of you who are waiting or with your doctor, then multiply by the 20-minute slot length.']];
  return (<div style={{ marginTop: 56 }}>
    <h2 style={{ fontSize: 26 }}>How it works</h2>
    <div className="grid g3" style={{ marginTop: 14 }}>{[['Book a slot', 'Choose your doctor and a free time. You get a booking ID straight away.'], ['Check in at the clinic', 'Give your booking ID at the front desk. Staff move you to the waiting room.'], ['Follow your queue', 'See your position and estimated wait live, and read your doctor’s notes after the visit.']].map(([t, d], i) =>
      <div className="card" key={t}><span className="av" style={{ width: 34, height: 34, fontSize: 14 }}>{i + 1}</span><h3 style={{ fontSize: 19, margin: '12px 0 6px' }}>{t}</h3><span className="muted">{d}</span></div>)}</div>
    <div className="grid g3" style={{ marginTop: 40 }}>
      <div className="card"><h3 style={{ fontSize: 19 }}>Clinic hours</h3><p className="muted" style={{ margin: '8px 0 0' }}>Every day, 9:00 to 17:00<br />Lunch break 13:00 to 14:00<br />20-minute appointments</p></div>
      <div className="card"><h3 style={{ fontSize: 19 }}>Services</h3><p className="muted" style={{ margin: '8px 0 0' }}>General medicine<br />Heart check-ups and BP care<br />Child care and vaccination<br />Skin and hair care</p></div>
      <div className="card"><h3 style={{ fontSize: 19 }}>Find us</h3><p className="muted" style={{ margin: '8px 0 0' }}>CarePoint Clinic, 12 MI Road, Jaipur<br />Phone 0141-400-0000<br />care@carepoint.example</p></div></div>
    <h2 style={{ fontSize: 26, marginTop: 40 }}>Common questions</h2>
    {faq.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
    <p className="foot">In an emergency, call 108 or go to the nearest hospital. This clinic does not handle emergencies. Contact details shown are sample details.</p></div>);
}

function App() {
  const [tab, setTab] = useState('patient');
  return (<><nav><div className="brand"><i>+</i><span>CarePoint Clinic</span></div>
    <div className="tabs"><button className={tab === 'patient' ? 'on' : ''} onClick={() => setTab('patient')}>Patient portal</button><button className={tab === 'staff' ? 'on' : ''} onClick={() => setTab('staff')}>Staff dashboard</button></div></nav>
    {tab === 'patient' ? <Patient /> : <Staff />}</>);
}
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
