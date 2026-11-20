#!/usr/bin/env node
/**
 * TLS Agent Server — local trigger server for the pipeline applet
 *
 * Usage: node scripts/agent-server.mjs
 *
 * Open scripts/pipeline.html in any browser on the same network.
 * The RUN button POSTs to this server which spawns the agent.
 * Agent output streams back via SSE at /stream.
 *
 * Access from another device on the same network:
 *   http://<this-computer-lan-ip>:3002
 *   e.g. http://192.168.1.100:3002
 */

import http from "http";
import { spawn } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import { networkInterfaces } from "os";
import { createClient } from "@supabase/supabase-js";

const PORT   = 3002;
const ROOT   = resolve(import.meta.dirname, "..");
const HTML   = join(ROOT, "scripts", "pipeline.html");

// ── Load env ──────────────────────────────────────────────────────────────────
const envPath = join(ROOT, ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

// Look up the first user's ID so the applet can filter by it
const db = createClient(SUPABASE_URL, SUPABASE_KEY);
const { data: users } = await db.auth.admin.listUsers({ perPage: 1 });
const USER_ID = users?.users?.[0]?.id ?? "";

// Allow requests from the Vercel app and local files
const ALLOWED_ORIGINS = [
  "https://thunder-lake-systems-ops.vercel.app",
  "http://localhost:3000",
  "null",   // file:// opens as "null" origin
  "",
];

let agentProc   = null;
let agentClients = [];  // SSE clients waiting for output

function cors(req, res) {
  const origin = req.headers.origin || "";
  const allow  = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader("Access-Control-Allow-Origin",  allow);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  agentClients.forEach(c => { try { c.write(msg); } catch {} });
}

const server = http.createServer((req, res) => {
  cors(req, res);

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // ── Serve applet HTML (inject env vars) ───────────────────────────────
  if (req.method === "GET" && req.url === "/") {
    if (!existsSync(HTML)) { res.writeHead(404); res.end("pipeline.html not found"); return; }
    const html = readFileSync(HTML, "utf8")
      .replace("'{{SUPABASE_URL}}'", JSON.stringify(SUPABASE_URL))
      .replace("'{{SUPABASE_KEY}}'", JSON.stringify(SUPABASE_KEY))
      .replace("'{{USER_ID}}'",      JSON.stringify(USER_ID));
    res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
    res.end(html);
    return;
  }

  // ── Trigger agent run ──────────────────────────────────────────────────
  if (req.method === "POST" && req.url === "/run") {
    if (agentProc) {
      res.writeHead(409, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Agent already running" }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, message: "Agent started" }));

    console.log("▶  Agent triggered");

    agentProc = spawn("node", ["scripts/income-agent.mjs"], {
      cwd: ROOT,
      env: process.env,
    });

    agentProc.stdout.on("data", chunk => {
      const lines = chunk.toString().split("\n");
      lines.forEach(line => {
        if (line.trim()) {
          console.log(line);
          broadcast({ line: line.trim() });
        }
      });
    });

    agentProc.stderr.on("data", chunk => {
      const line = chunk.toString().trim();
      if (line) { console.error(line); broadcast({ line, error: true }); }
    });

    agentProc.on("close", code => {
      console.log(`✅  Agent exited (code ${code})`);
      broadcast({ done: true, code });
      agentProc = null;
    });

    return;
  }

  // ── SSE stream ─────────────────────────────────────────────────────────
  if (req.method === "GET" && req.url === "/stream") {
    res.writeHead(200, {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    });
    res.write(": connected\n\n");
    agentClients.push(res);

    req.on("close", () => {
      agentClients = agentClients.filter(c => c !== res);
    });
    return;
  }

  // ── Status ─────────────────────────────────────────────────────────────
  if (req.method === "GET" && req.url === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ running: !!agentProc, clients: agentClients.length }));
    return;
  }

  // ── Stop server ────────────────────────────────────────────────────────
  if (req.method === "POST" && req.url === "/stop") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    console.log("🛑  Server stopped by user");
    setTimeout(() => process.exit(0), 100);
    return;
  }

  res.writeHead(404); res.end("Not found");
});

server.listen(PORT, "0.0.0.0", () => {
  const nets = Object.values(networkInterfaces()).flat()
    .filter(i => i.family === "IPv4" && !i.internal)
    .map(i => i.address);

  console.log(`\n🚀  TLS Agent Server running on port ${PORT}`);
  console.log(`\n   Local:    http://localhost:${PORT}`);
  nets.forEach(ip => console.log(`   Network:  http://${ip}:${PORT}`));
  console.log(`\n   Open in browser — RUN button fires the agent here\n`);
});
