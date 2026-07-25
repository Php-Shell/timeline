const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public'));


// ---------- persistent storage paths (DATA must be defined BEFORE use) ----------
const DATA = process.env.RENDER ? '/opt/render/project/src/data' : '.';
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
// serve uploaded files
app.use('/uploads', require('express').static(UPLOAD_DIR));

// ---------- SQLite ----------
const db = new Database(path.join(DATA, 'career.db'));
db.exec(`CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL
)`);

const getJobs = () =>
  db.prepare('SELECT id, data FROM jobs').all()
    .map(r => ({ id: r.id, ...JSON.parse(r.data) }));

const setJobs = jobs => {
  const tx = db.transaction(list => {
    db.prepare('DELETE FROM jobs').run();
    const ins = db.prepare('INSERT INTO jobs (id, data) VALUES (?, ?)');
    for (const j of list) {
      const { id, ...rest } = j;
      ins.run(id, JSON.stringify(rest));
    }
  });
  tx(jobs || []);
};

// ---------- realtime ----------
const server = http.createServer(app);
const io = require('socket.io')(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 10 * 1024 * 1024   // ← allow up to 10 MB files (default is only 1 MB!)
});

io.on('connection', sock => {
  sock.emit('state', getJobs()); // send current data on join
  sock.on('jobs', jobs => { setJobs(jobs); sock.broadcast.emit('jobs', jobs); });
  sock.on('upload', (file, cb) => {
    try {
      if (!file || !file.data || !file.name) return cb(null);
      const safe = Date.now() + '_' + String(file.name).replace(/[^\w.\-() ]/g, '_').slice(-80);
      fs.writeFileSync(path.join(DATA, 'uploads', safe), Buffer.from(file.data));
      cb('/uploads/' + safe);
    } catch (e) { console.error('upload failed', e); cb(null); }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Career timeline server on :' + PORT));