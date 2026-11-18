import { useState, useEffect } from 'react'

const api = async (path, { method = 'GET', body } = {}) => {
  const r = await fetch('/api' + path, { method, body: body && JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') } })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Request failed')
  return d
}
const get = (o, p) => p.split('.').reduce((a, k) => a?.[k], o)
const fmt = v => new Date(v).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
const ALL = ['admin', 'doctor', 'receptionist'], FRONT = ['admin', 'receptionist']

const MODULES = {
  patients: { label: 'Patients', see: ALL, edit: FRONT, one: 'patient',
    cols: [['Name', 'name'], ['Age', 'age'], ['Gender', 'gender'], ['Phone', 'phone'], ['Blood group', 'bloodGroup']],
    fields: [{ k: 'name', l: 'Full name' }, { k: 'age', l: 'Age', t: 'number' }, { k: 'gender', l: 'Gender', o: ['Female', 'Male', 'Other'] },
      { k: 'phone', l: 'Phone' }, { k: 'bloodGroup', l: 'Blood group', o: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] }, { k: 'address', l: 'Address' }] },
  appointments: { label: 'Appointments', see: ALL, edit: FRONT, one: 'appointment',
    cols: [['When', 'date', 'date'], ['Patient', 'patient.name'], ['Doctor', 'doctor.name'], ['Reason', 'reason'], ['Status', 'status', 'tag']],
    fields: [{ k: 'patient', l: 'Patient', o: 'patients' }, { k: 'doctor', l: 'Doctor', o: 'doctors' }, { k: 'date', l: 'Date and time', t: 'datetime-local' },
      { k: 'reason', l: 'Reason for visit' }, { k: 'status', l: 'Status', o: ['scheduled', 'completed', 'cancelled'] }] },
  records: { label: 'Medical records', see: ALL, edit: ['admin', 'doctor'], one: 'record',
    cols: [['Date', 'createdAt', 'date'], ['Patient', 'patient.name'], ['Diagnosis', 'diagnosis'], ['Prescription', 'prescription'], ['Doctor', 'doctor.name']],
    fields: [{ k: 'patient', l: 'Patient', o: 'patients' }, { k: 'diagnosis', l: 'Diagnosis' }, { k: 'prescription', l: 'Prescription', t: 'area' }, { k: 'notes', l: 'Clinical notes', t: 'area' }] },
  bills: { label: 'Billing', see: FRONT, edit: FRONT, one: 'bill',
    cols: [['Date', 'createdAt', 'date'], ['Patient', 'patient.name'], ['Description', 'description'], ['Amount', 'amount'], ['Status', 'status', 'tag']],
    fields: [{ k: 'patient', l: 'Patient', o: 'patients' }, { k: 'description', l: 'Description' }, { k: 'amount', l: 'Amount', t: 'number' }, { k: 'status', l: 'Status', o: ['unpaid', 'paid'] }] },
  users: { label: 'Staff accounts', see: ['admin'], edit: ['admin'], one: 'staff account',
    cols: [['Name', 'name'], ['Email', 'email'], ['Role', 'role'], ['Specialty', 'specialty']],
    fields: [{ k: 'name', l: 'Full name' }, { k: 'email', l: 'Email', t: 'email' }, { k: 'password', l: 'Password (leave blank to keep)', t: 'password' },
      { k: 'role', l: 'Role', o: ['admin', 'doctor', 'receptionist'] }, { k: 'specialty', l: 'Specialty (doctors)' }] }
}

function Login({ onDone }) {
  const [f, setF] = useState({ email: '', password: '' }), [err, setErr] = useState('')
  const go = async e => { e.preventDefault(); try { const d = await api('/login', { method: 'POST', body: f }); localStorage.setItem('token', d.token); onDone(d.user) } catch (x) { setErr(x.message) } }
  return <div className="login"><form onSubmit={go}><h1 style={{ margin: 0 }}>Mukono Hospital Care Desk</h1>
    <label>Email<input type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></label>
    <label>Password<input type="password" required value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></label>
    {err && <p className="err">{err}</p>}<button className="btn">Sign in</button></form></div>
}

function Dashboard() {
  const [s, setS] = useState(null)
  useEffect(() => { api('/stats').then(setS) }, [])
  if (!s) return <p>Loading…</p>
  return <><h2>Today at Mukono Hospital</h2>
    <div className="stats"><div><b>{s.patients}</b>Registered patients</div><div><b>{s.appointments}</b>Scheduled appointments</div>
      <div><b>{s.unpaid}</b>Unpaid bills</div><div><b>{s.revenue.toLocaleString()}</b>Revenue collected</div></div>
    <h3>Next appointments</h3>
    {s.upcoming.length ? <table><tbody>{s.upcoming.map(a => <tr key={a._id}><td>{fmt(a.date)}</td><td>{a.patient?.name}</td><td>{a.doctor?.name}</td><td>{a.reason}</td></tr>)}</tbody></table>
      : <div className="empty">No upcoming appointments. Book one under Appointments.</div>}</>
}

function Module({ id, user }) {
  const m = MODULES[id], canEdit = m.edit.includes(user.role)
  const [rows, setRows] = useState([]), [look, setLook] = useState({}), [form, setForm] = useState(null), [err, setErr] = useState('')
  const load = () => api('/' + id).then(setRows).catch(e => setErr(e.message))
  useEffect(() => { setForm(null); load() }, [id])
  useEffect(() => { if (m.fields.some(f => f.o === 'patients')) api('/patients').then(p => setLook(l => ({ ...l, patients: p }))).catch(() => {});
    if (m.fields.some(f => f.o === 'doctors')) api('/doctors').then(d => setLook(l => ({ ...l, doctors: d }))).catch(() => {}) }, [id])

  const open = row => {
    const v = {}; m.fields.forEach(f => { let x = row?.[f.k]
      if (x && typeof x === 'object') x = x._id
      if (x && f.t === 'datetime-local') x = new Date(new Date(x) - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16)
      v[f.k] = x ?? (Array.isArray(f.o) && !row ? f.o[0] : '') })
    setForm({ id: row?._id, v }); setErr('')
  }
  const save = async e => { e.preventDefault(); try {
    const body = { ...form.v }; if (body.date) body.date = new Date(body.date).toISOString()
    await api('/' + id + (form.id ? '/' + form.id : ''), { method: form.id ? 'PUT' : 'POST', body }); setForm(null); load()
  } catch (x) { setErr(x.message) } }
  const del = async r => { if (confirm('Delete this ' + m.one + '? This cannot be undone.')) { await api('/' + id + '/' + r._id, { method: 'DELETE' }); load() } }

  return <><div className="bar"><h2 style={{ margin: 0 }}>{m.label}</h2>{canEdit && <button className="btn" onClick={() => open()}>Add {m.one}</button>}</div>
    {err && !form && <p className="err">{err}</p>}
    {rows.length ? <table><thead><tr>{m.cols.map(c => <th key={c[0]}>{c[0]}</th>)}{canEdit && <th></th>}</tr></thead>
      <tbody>{rows.map(r => <tr key={r._id}>{m.cols.map(([l, p, t]) => { const v = get(r, p); return <td key={l}>{t === 'date' ? fmt(v) : t === 'tag' ? <span className={'tag ' + v}>{v}</span> : v}</td> })}
        {canEdit && <td><button className="btn ghost" onClick={() => open(r)}>Edit</button> <button className="btn del" onClick={() => del(r)}>Delete</button></td>}</tr>)}</tbody></table>
      : <div className="empty">No {m.label.toLowerCase()} yet.{canEdit && ' Use the button above to add the first one.'}</div>}
    {form && <div className="modal"><form onSubmit={save}><h3 style={{ margin: 0 }}>{form.id ? 'Edit' : 'Add'} {m.one}</h3>
      {m.fields.map(f => <label key={f.k}>{f.l}
        {f.t === 'area' ? <textarea rows="3" value={form.v[f.k]} onChange={e => setForm({ ...form, v: { ...form.v, [f.k]: e.target.value } })} />
          : f.o ? <select required value={form.v[f.k]} onChange={e => setForm({ ...form, v: { ...form.v, [f.k]: e.target.value } })}>
            <option value="">Select…</option>
            {(Array.isArray(f.o) ? f.o.map(x => [x, x]) : (look[f.o] || []).map(x => [x._id, x.name + (x.specialty ? ' (' + x.specialty + ')' : '')])).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
          : <input type={f.t || 'text'} required={f.k === 'name' || f.k === 'email' || f.k === 'date' || f.k === 'amount' || f.k === 'diagnosis' || (f.k === 'password' && !form.id)}
            value={form.v[f.k]} onChange={e => setForm({ ...form, v: { ...form.v, [f.k]: e.target.value } })} />}</label>)}
      {err && <p className="err">{err}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" className="btn ghost" onClick={() => setForm(null)}>Cancel</button><button className="btn">Save</button></div>
    </form></div>}</>
}

export default function App() {
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('user')) } catch { return null } })
  const [tab, setTab] = useState('dashboard')
  const done = u => { localStorage.setItem('user', JSON.stringify(u)); setUser(u) }
  const out = () => { localStorage.clear(); setUser(null) }
  if (!user) return <Login onDone={done} />
  return <div className="shell"><nav><h1>Mukono Hospital<small>Care Desk</small></h1>
    <button className={tab === 'dashboard' ? 'on' : ''} onClick={() => setTab('dashboard')}>Dashboard</button>
    {Object.entries(MODULES).filter(([, m]) => m.see.includes(user.role)).map(([k, m]) =>
      <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{m.label}</button>)}
    <div className="who">{user.name} ({user.role})<br /><button onClick={out} style={{ padding: 0, textDecoration: 'underline' }}>Sign out</button></div></nav>
    <main>{tab === 'dashboard' ? <Dashboard /> : <Module key={tab} id={tab} user={user} />}</main></div>
}