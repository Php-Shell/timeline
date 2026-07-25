// package.json deps: express, socket.io, better-sqlite3, cors
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.static('public'));                 // serves index.html too if you want
app.use('/uploads', express.static('uploads'));
fs.mkdirSync('uploads', { recursive: true });

const db = new Database('career.db');              // SQLite file storage
db.exec(`CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), jobs TEXT NOT NULL DEFAULT '[]')`);
const getJobs = () => JSON.parse(db.prepare('SELECT jobs FROM state WHERE id=1').get()?.jobs || '[]');
const setJobs = j => db.prepare(
  'INSERT INTO state(id,jobs) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET jobs=excluded.jobs').run(JSON.stringify(j));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, maxHttpBufferSize: 25e6 });

io.on('connection', sock => {
  sock.emit('state', getJobs());                   // send current data on join
  sock.on('jobs', jobs => { setJobs(jobs); sock.broadcast.emit('jobs', jobs); }); // live relay to everyone else
  sock.on('upload', ({ name, data }, cb) => {
    const safe = Date.now() + '-' + name.replace(/[^\w.\-]/g, '_');
    fs.writeFileSync(path.join('uploads', safe), Buffer.from(data));
    cb('/uploads/' + safe);                        // return public URL
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Career timeline server on :' + PORT));