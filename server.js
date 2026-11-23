// Air Ping Pong phone-controller server: serves the two pages and relays WebSocket messages.
const fs = require("fs");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");
const selfsigned = require("selfsigned");
const QRCode = require("qrcode");
const { WebSocketServer, WebSocket } = require("ws");

const HTTPS_PORT = 8443, HTTP_PORT = 8080;
const PUBLIC_URL = (process.env.PUBLIC_URL || "").trim().replace(/\/+$/, "");
const PAGES = { "/": "air-ping-pong.html", "/index.html": "air-ping-pong.html", "/phone.html": "phone.html" };

// LAN IPv4 addresses, real adapters first (virtual ones from WSL, VMs or VPNs can't be reached by the phone).
function lanIPs() {
  const virtual = /vEthernet|WSL|VMware|VirtualBox|Hyper-V|Loopback|Tailscale|ZeroTier|VPN/i, found = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces()))
    for (const a of addrs || [])
      if (a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254.")) found.push({ ip: a.address, rank: virtual.test(name) ? 1 : 0 });
  return found.sort((a, b) => a.rank - b.rank).map(a => a.ip);
}

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  const send = (code, type, body) => { res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" }); res.end(body); };
  if (req.method !== "GET" && req.method !== "HEAD") return send(405, "text/plain", "Method not allowed");
  const page = PAGES[url.pathname];
  if (page) {
    try { return send(200, "text/html; charset=utf-8", fs.readFileSync(path.join(__dirname, page))); }
    catch { return send(404, "text/plain", `${page} not found`); }
  }
  if (url.pathname === "/favicon.ico") return send(204, "image/x-icon");
  if (url.pathname === "/info") return send(200, "application/json", JSON.stringify({ publicUrl: PUBLIC_URL || null, lan: lanIPs().map(ip => `https://${ip}:${HTTPS_PORT}`) }));
  if (url.pathname === "/qr.svg") {
    const text = url.searchParams.get("text") || "";
    if (!text || text.length > 512) return send(400, "text/plain", "text is required (max 512 characters)");
    return send(200, "image/svg+xml", await QRCode.toString(text, { type: "svg", margin: 2, errorCorrectionLevel: "M" }));
  }
  send(404, "text/plain", "Not found");
}
const onRequest = (req, res) => handle(req, res).catch(e => { console.error(e); if (!res.headersSent) res.writeHead(500); res.end(); });

/* Relay: each room holds one game and one phone. A newer connection with the same role replaces the older one (a reloaded page). */
const rooms = new Map();
const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 4096 });
const tell = (ws, msg) => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); };

function onUpgrade(req, socket, head) {
  const url = new URL(req.url, "http://localhost"), room = (url.searchParams.get("room") || "").toUpperCase(), role = url.searchParams.get("role");
  if (url.pathname !== "/ws" || !/^[A-Z0-9]{4,8}$/.test(room) || (role !== "game" && role !== "phone")) {
    socket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n"); return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, ws => join(ws, room, role));
}

function join(ws, room, role) {
  const r = rooms.get(room) || {}; rooms.set(room, r);
  const other = role === "game" ? "phone" : "game";
  if (r[role]) r[role].close(4000, "replaced");
  r[role] = ws; ws.alive = true;
  tell(ws, { type: "peer", role: other, connected: !!r[other] });
  tell(r[other], { type: "peer", role, connected: true });
  console.log(`[${room}] ${role} connected`);

  ws.on("pong", () => { ws.alive = true; });
  ws.on("message", (data, isBinary) => {
    const peer = r[other];
    if (peer && peer.readyState === WebSocket.OPEN && peer.bufferedAmount < 32768) peer.send(data, { binary: isBinary });   // a slow peer drops samples instead of building up lag
  });
  ws.on("error", e => console.error(`[${room}] ${role}: ${e.message}`));
  ws.on("close", () => {
    if (r[role] !== ws) return;
    delete r[role]; tell(r[other], { type: "peer", role, connected: false });
    console.log(`[${room}] ${role} disconnected`);
    if (!r.game && !r.phone) rooms.delete(room);
  });
}
// Detect phones that vanished without closing (screen locked, Wi-Fi lost).
setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); } }, 4000).unref();

function listen(server, port, host, label) {
  server.on("upgrade", onUpgrade);
  server.on("error", e => {
    console.error(e.code === "EADDRINUSE" ? `Port ${port} is already in use. Close the other server and retry.` : `${label} server error: ${e.message}`);
    process.exit(1);
  });
  return new Promise(ok => server.listen(port, host, ok));
}

(async () => {
  const ips = lanIPs(), notBeforeDate = new Date(Date.now() - 864e5), notAfterDate = new Date(Date.now() + 30 * 864e5);
  const altNames = [{ type: 2, value: "localhost" }, { type: 7, ip: "127.0.0.1" }, ...ips.map(ip => ({ type: 7, ip }))];
  const pems = await selfsigned.generate([{ name: "commonName", value: "air-ping-pong.local" }], {
    keySize: 2048, algorithm: "sha256", notBeforeDate, notAfterDate,
    extensions: [
      { name: "basicConstraints", cA: false },
      { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
      { name: "extKeyUsage", serverAuth: true },
      { name: "subjectAltName", altNames },
    ],
  });
  await listen(https.createServer({ key: pems.private, cert: pems.cert }, onRequest), HTTPS_PORT, "0.0.0.0", "HTTPS");
  await listen(http.createServer(onRequest), HTTP_PORT, "127.0.0.1", "HTTP");   // localhost only: the tunnel connects from this machine

  console.log("\nAir Ping Pong is running\n");
  console.log(`  Laptop:  https://localhost:${HTTPS_PORT}`);
  for (const ip of ips) console.log(`  LAN:     https://${ip}:${HTTPS_PORT}`);
  console.log(`  Tunnel:  http://localhost:${HTTP_PORT} (for cloudflared)`);
  if (PUBLIC_URL) console.log(`  Public:  ${PUBLIC_URL} (used in the QR code)`);
  if (!ips.length && !PUBLIC_URL) console.log("  No LAN address found. Connect to Wi-Fi or use a tunnel (see README).");
  console.log("\nOpen the laptop URL, accept the certificate warning, then scan the QR code.\n");
})().catch(e => { console.error(e); process.exit(1); });
