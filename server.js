// Foro en vivo: A favor / En contra + "Alzar la mano" (20 s)
// Sin dependencias: Node.js puro + Server-Sent Events.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;
const TURNO_MS = 20 * 1000;
const GRACIA_MS = 45 * 1000; // tiempo para reconectar antes de quitar a alguien

const participantes = new Map(); // id -> { id, nombre, lado, online, desde }
const clientes = new Map();      // res -> id
let orador = null;               // { id, nombre, lado, fin }
let timerTurno = null;
const timersSalida = new Map();

const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));

function estado() {
  const lista = [...participantes.values()]
    .filter(p => p.nombre)
    .map(({ id, nombre, lado, online }) => ({ id, nombre, lado, online }));
  return {
    participantes: lista,
    orador: orador ? { id: orador.id, nombre: orador.nombre, lado: orador.lado, restante: Math.max(0, orador.fin - Date.now()) } : null,
    turnoMs: TURNO_MS,
  };
}

function difundir() {
  const data = `data: ${JSON.stringify(estado())}\n\n`;
  for (const res of clientes.keys()) res.write(data);
}

function terminarTurno() {
  clearTimeout(timerTurno);
  timerTurno = null;
  orador = null;
  difundir();
}

function leerJSON(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e4) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); } });
  });
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

const limpiar = (s, n) => String(s || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
const idValido = id => typeof id === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(id);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(html);
  }

  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true });

  if (req.method === 'GET' && url.pathname === '/events') {
    const id = url.searchParams.get('id');
    if (!idValido(id)) return json(res, 400, { error: 'id inválido' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    clientes.set(res, id);
    clearTimeout(timersSalida.get(id));
    const p = participantes.get(id);
    if (p) p.online = true;
    res.write(`data: ${JSON.stringify(estado())}\n\n`);
    if (p) difundir();

    req.on('close', () => {
      clientes.delete(res);
      if ([...clientes.values()].includes(id)) return;
      const q = participantes.get(id);
      if (!q) return;
      q.online = false;
      difundir();
      timersSalida.set(id, setTimeout(() => {
        if ([...clientes.values()].includes(id)) return;
        participantes.delete(id);
        if (orador && orador.id === id) terminarTurno(); else difundir();
      }, GRACIA_MS));
    });
    return;
  }

  if (req.method === 'POST') {
    const body = await leerJSON(req);
    const id = body.id;
    if (!idValido(id)) return json(res, 400, { error: 'id inválido' });

    if (url.pathname === '/api/unirse') {
      const nombre = limpiar(body.nombre, 30);
      if (!nombre) return json(res, 400, { error: 'Escribe tu nombre' });
      const p = participantes.get(id) || { id, lado: null, desde: Date.now() };
      p.nombre = nombre;
      p.online = [...clientes.values()].includes(id);
      participantes.set(id, p);
      difundir();
      return json(res, 200, { ok: true });
    }

    const p = participantes.get(id);
    if (!p) return json(res, 404, { error: 'Primero escribe tu nombre' });

    if (url.pathname === '/api/lado') {
      if (!['favor', 'contra'].includes(body.lado)) return json(res, 400, { error: 'Opción inválida' });
      p.lado = body.lado;
      if (orador && orador.id === id) orador.lado = p.lado;
      difundir();
      return json(res, 200, { ok: true });
    }

    if (url.pathname === '/api/mano') {
      if (!p.lado) return json(res, 409, { error: 'Elige primero: A favor o En contra' });
      if (orador) return json(res, 409, { error: `${orador.nombre} tiene la palabra` });
      orador = { id, nombre: p.nombre, lado: p.lado, fin: Date.now() + TURNO_MS };
      timerTurno = setTimeout(terminarTurno, TURNO_MS);
      difundir();
      return json(res, 200, { ok: true });
    }

    if (url.pathname === '/api/ceder') {
      if (orador && orador.id === id) terminarTurno();
      return json(res, 200, { ok: true });
    }

    if (url.pathname === '/api/salir') {
      participantes.delete(id);
      if (orador && orador.id === id) terminarTurno(); else difundir();
      return json(res, 200, { ok: true });
    }
  }

  json(res, 404, { error: 'No encontrado' });
});

// Mantener viva la conexión (proxies y móviles cortan conexiones inactivas)
setInterval(() => { for (const res of clientes.keys()) res.write(': ping\n\n'); }, 15000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nForo en vivo corriendo en el puerto ${PORT}`);
  console.log(`  En esta computadora:  http://localhost:${PORT}`);
  for (const ifs of Object.values(os.networkInterfaces())) {
    for (const i of ifs || []) {
      if (i.family === 'IPv4' && !i.internal) console.log(`  En la misma red WiFi: http://${i.address}:${PORT}`);
    }
  }
  console.log('');
});
