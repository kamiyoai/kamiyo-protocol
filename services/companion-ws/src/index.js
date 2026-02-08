import http from 'http';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';

dotenv.config();

const PORT = parseInt(process.env.PORT || '4021', 10);
const MAX_EVENTS = Math.max(1, parseInt(process.env.MAX_EVENTS || '500', 10));
const MOCK_EVENTS = process.env.MOCK_EVENTS === 'true';
const INGEST_API_KEY = process.env.INGEST_API_KEY?.trim() || '';

/** @type {any[]} */
const buffer = [];

function pushEvent(event) {
  buffer.push(event);
  if (buffer.length > MAX_EVENTS) buffer.splice(0, buffer.length - MAX_EVENTS);
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function badRequest(res, message) {
  json(res, 400, { error: message });
}

const server = http.createServer(async (req, res) => {
  const url = req.url?.split('?')[0] || '/';

  if (url === '/health') {
    json(res, 200, { status: 'ok', service: 'companion-ws', bufferedEvents: buffer.length });
    return;
  }

  // Optional ingestion endpoint so other services can push events into the stream.
  if (url === '/ingest' && req.method === 'POST') {
    if (!INGEST_API_KEY) {
      json(res, 403, { error: 'ingest_disabled' });
      return;
    }

    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${INGEST_API_KEY}`) {
      json(res, 401, { error: 'unauthorized' });
      return;
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      badRequest(res, 'invalid_json');
      return;
    }

    if (!body || typeof body !== 'object' || !body.event) {
      badRequest(res, 'missing_event');
      return;
    }

    pushEvent(body.event);
    broadcast({ type: 'event', event: body.event });
    json(res, 200, { ok: true });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

const wss = new WebSocketServer({ server });

function broadcast(payload) {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(data);
    }
  }
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'replay', events: buffer }));
});

function makeMockEvent() {
  const agents = ['kamiyo', 'oracle', 'chaos', 'sage'];
  const colors = {
    kamiyo: '#00f0ff',
    oracle: '#9944ff',
    chaos: '#ff44f5',
    sage: '#ffaa22',
  };
  const source = agents[Math.floor(Math.random() * agents.length)];
  const target = agents[Math.floor(Math.random() * agents.length)];
  return {
    id: crypto.randomUUID(),
    type: 'stream:mock',
    category: 'demo',
    timestamp: Date.now(),
    source,
    target,
    data: { message: 'mock event' },
    visual: { color: colors[source], intensity: 0.5 + Math.random() * 0.5, duration: 1500 },
  };
}

if (MOCK_EVENTS) {
  setInterval(() => {
    const event = makeMockEvent();
    pushEvent(event);
    broadcast({ type: 'event', event });
  }, 1200);
}

server.listen(PORT, () => {
  console.log(`[companion-ws] listening on ${PORT}`);
});

