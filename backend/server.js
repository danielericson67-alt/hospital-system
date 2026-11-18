require('dotenv').config();
if (!process.env.JWT_SECRET) { console.error('JWT_SECRET is missing in the .env file'); process.exit(1); }
const express = require('express'), mongoose = require('mongoose'), cors = require('cors');
const bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken');
const { Schema, model } = mongoose, Id = Schema.Types.ObjectId;

// ---------- Models (they use the collections you made in mongosh) ----------
const userS = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'doctor', 'receptionist'], default: 'receptionist' },
  specialty: String
}, { timestamps: true });
userS.set('toJSON', { transform: (d, r) => { delete r.password; return r; } });
const User = model('User', userS);

const Patient = model('Patient', new Schema({
  name: { type: String, required: true }, age: Number, gender: String,
  phone: String, address: String, bloodGroup: String
}, { timestamps: true }));

const apptS = new Schema({
  patient: { type: Id, ref: 'Patient', required: true },
  doctor: { type: Id, ref: 'User', required: true },
  date: { type: Date, required: true }, reason: String,
  status: { type: String, enum: ['scheduled', 'completed', 'cancelled'], default: 'scheduled' }
}, { timestamps: true });
apptS.pre('save', async function () {
  if (this.status === 'scheduled' && (this.isNew || this.isModified('date') || this.isModified('doctor'))) {
    const clash = await mongoose.model('Appointment').exists({ _id: { $ne: this._id }, doctor: this.doctor, date: this.date, status: 'scheduled' });
    if (clash) throw new Error('This doctor already has an appointment at that time');
  }
});
const Appointment = model('Appointment', apptS);

const Record = model('Record', new Schema({
  patient: { type: Id, ref: 'Patient', required: true }, doctor: { type: Id, ref: 'User' },
  diagnosis: { type: String, required: true }, prescription: String, notes: String
}, { timestamps: true }));

const Bill = model('Bill', new Schema({
  patient: { type: Id, ref: 'Patient', required: true }, description: String,
  amount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid' }
}, { timestamps: true }));

// ---------- Auth helpers ----------
const sign = u => jwt.sign({ id: u.id, role: u.role, name: u.name }, process.env.JWT_SECRET, { expiresIn: '8h' });
const auth = (q, s, n) => {
  try { q.user = jwt.verify((q.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET); n(); }
  catch { s.status(401).json({ error: 'Please sign in again' }); }
};
const allow = (...roles) => (q, s, n) => roles.includes(q.user.role) ? n() : s.status(403).json({ error: 'Your role cannot do this' });
const h = fn => async (q, s) => {
  try { await fn(q, s); }
  catch (e) { s.status(e.code === 11000 ? 409 : 400).json({ error: e.code === 11000 ? 'That value already exists' : e.message }); }
};

// ---------- Generic CRUD router ----------
const ALL = ['admin', 'doctor', 'receptionist'];
function crud(M, { pop = [], read = ALL, write, pre = async b => b }) {
  const r = express.Router(); r.use(auth);
  r.get('/', allow(...read), h(async (q, s) => s.json(await M.find().populate(pop).sort('-createdAt'))));
  r.post('/', allow(...write), h(async (q, s) => {
    const d = await M.create(await pre(q.body, q.user)); s.status(201).json(await d.populate(pop));
  }));
  r.put('/:id', allow(...write), h(async (q, s) => {
    const d = await M.findById(q.params.id); if (!d) return s.status(404).json({ error: 'Not found' });
    d.set(await pre(q.body, q.user, true)); await d.save(); s.json(await d.populate(pop));
  }));
  r.delete('/:id', allow(...write), h(async (q, s) => { await M.findByIdAndDelete(q.params.id); s.json({ ok: true }); }));
  return r;
}

const app = express(); app.use(cors(), express.json());

app.post('/api/login', h(async (q, s) => {
  const u = await User.findOne({ email: (q.body.email || '').toLowerCase() });
  if (!u || !(await bcrypt.compare(q.body.password || '', u.password))) return s.status(401).json({ error: 'Wrong email or password' });
  s.json({ token: sign(u), user: u });
}));

app.get('/api/doctors', auth, h(async (q, s) => s.json(await User.find({ role: 'doctor' }).select('name specialty'))));

app.get('/api/stats', auth, h(async (q, s) => {
  const [patients, appointments, unpaid, revenue, upcoming] = await Promise.all([
    Patient.countDocuments(), Appointment.countDocuments({ status: 'scheduled' }),
    Bill.countDocuments({ status: 'unpaid' }),
    Bill.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, t: { $sum: '$amount' } } }]),
    Appointment.find({ status: 'scheduled', date: { $gte: new Date() } }).sort('date').limit(8).populate('patient', 'name').populate('doctor', 'name')
  ]);
  s.json({ patients, appointments, unpaid, revenue: revenue[0]?.t || 0, upcoming });
}));

app.use('/api/patients', crud(Patient, { write: ['admin', 'receptionist'] }));
app.use('/api/appointments', crud(Appointment, { pop: [{ path: 'patient', select: 'name' }, { path: 'doctor', select: 'name specialty' }], write: ['admin', 'receptionist'] }));
app.use('/api/records', crud(Record, { pop: [{ path: 'patient', select: 'name' }, { path: 'doctor', select: 'name' }], write: ['admin', 'doctor'], pre: async (b, u) => ({ ...b, doctor: u.id }) }));
app.use('/api/bills', crud(Bill, { pop: [{ path: 'patient', select: 'name' }], read: ['admin', 'receptionist'], write: ['admin', 'receptionist'] }));
app.use('/api/users', crud(User, { read: ['admin'], write: ['admin'],
  pre: async b => { b = { ...b }; if (b.password) b.password = await bcrypt.hash(b.password, 10); else delete b.password; return b; } }));

// ---------- Start ----------
mongoose.connect(process.env.MONGO_URI).then(() => {
  app.listen(process.env.PORT || 5000, () => console.log('Mukono Hospital Care Desk API running on port ' + (process.env.PORT || 5000)));
}).catch(e => { console.error('MongoDB connection failed:', e.message); process.exit(1); });