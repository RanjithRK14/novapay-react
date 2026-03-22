import { useState, useEffect, useRef, useContext, createContext, useCallback } from "react";

// Vite dev proxy: /api-gw → http://localhost:8080 (eliminates CORS entirely)
const API_BASE = "/api-gw";

// ── JWT helper: decode payload from real JWT (no library needed) ──────────────
function parseJwt(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch { return null; }
}

const api = {
  async request(method, path, body, token) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, {
      method, headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data === "string" ? data : (data.message || data.error || "User not found" || `Error ${res.status}`));
    return data;
  },

  // ── Auth — real backend endpoints ──────────────────────────────
  // POST /auth/login  → { token }
  login: (email, password) => api.request("POST", "/auth/login", { email, password }),
  // POST /auth/signup → plain text "User registered successfully with ID: X"
  register: (payload) => api.request("POST", "/auth/signup", {
    name: payload.name,
    email: payload.email,
    password: payload.password,
  }),

  // ── User profile — real endpoint: GET /api/users/{userId} ─────
  getUser: (token) => {
    const claims = parseJwt(token);
    const userId = claims?.userId;
    if (!userId) throw new Error("No userId in token");
    return api.request("GET", `/api/users/${userId}`, null, token);
  },
  // Fetch any user by ID (for resolving names in transactions)
  getUserById: (userId, token) => api.request("GET", `/api/users/${userId}`, null, token).catch(() => null),

  // ── Wallet — real endpoint: GET /api/v1/wallets/{userId} ────────
  getWallet: (token) => {
    const claims = parseJwt(token);
    const userId = claims?.userId;
    if (!userId) throw new Error("No userId in token");
    return api.request("GET", `/api/v1/wallets/${userId}`, null, token);
  },

  // ── Transactions — real endpoint: GET /api/transactions/my ─────
  getTransactions: (token) => api.request("GET", "/api/transactions/my", null, token),

  // ── Send money — real endpoint: POST /api/transactions/create ──
  // Backend expects: { receiverId, amount, status }
  sendMoney: (payload, token) => {
    const claims = parseJwt(token);
    return api.request("POST", "/api/transactions/create", {
      receiverId: payload.receiverId,
      amount: payload.amount,
      status: "PENDING",
    }, token);
  },

  // ── Add funds — real endpoint: POST /api/v1/wallets/credit ─────
  addFunds: (amount, token) => {
    const claims = parseJwt(token);
    const userId = claims?.userId;
    if (!userId) throw new Error("No userId in token");
    return api.request("POST", "/api/v1/wallets/credit", {
      userId,
      amount: Math.round(amount), // send raw rupees (backend stores as Long)
      currency: "INR",
    }, token);
  },

  // ── Withdraw — real endpoint: POST /api/v1/wallets/debit ───────
  withdrawFunds: (amount, token) => {
    const claims = parseJwt(token);
    const userId = claims?.userId;
    if (!userId) throw new Error("No userId in token");
    return api.request("POST", "/api/v1/wallets/debit", {
      userId,
      amount: Math.round(amount), // raw rupees
      currency: "INR",
    }, token);
  },

  // ── Rewards — real endpoint: GET /api/rewards/user/{userId} ────
  getRewards: (token) => {
    const claims = parseJwt(token);
    const userId = claims?.userId;
    if (!userId) return Promise.resolve([]);
    return api.request("GET", `/api/rewards/user/${userId}`, null, token).catch(() => []);
  },
  getRewardHistory: (token) => {
    const claims = parseJwt(token);
    const userId = claims?.userId;
    if (!userId) return Promise.resolve([]);
    return api.request("GET", `/api/rewards/user/${userId}`, null, token).catch(() => []);
  },

  // ── Notifications — real endpoint: GET /api/notify/{userId} ────
  getNotifications: (token) => {
    const claims = parseJwt(token);
    const userId = claims?.userId;
    if (!userId) return Promise.resolve([]);
    return api.request("GET", `/api/notify/${userId}`, null, token).catch(() => []);
  },
  // No mark-read endpoint in backend — handled client-side only
  markRead: (id, token) => Promise.resolve(),
};

const AuthContext = createContext(null);
function useAuth() { return useContext(AuthContext); }

function useIsMobile(bp = 768) {
  const [v, setV] = useState(() => typeof window !== "undefined" && window.innerWidth < bp);
  useEffect(() => {
    const fn = () => setV(window.innerWidth < bp);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, [bp]);
  return v;
}

const MOCK = {
  user: { id: 1, name: "Ranjith Kumar", email: "ranjith@novapay.io", phone: "+91 98765 43210", verified: true },
  wallet: { balance: 284750.75, currency: "INR", walletId: "NP-2025-001847" },
  transactions: [
    { id: 1, type: "CREDIT", amount: 45000, description: "Freelance Payment from Karthik M.", timestamp: new Date(Date.now() - 7200000).toISOString(), status: "SUCCESS" },
    { id: 2, type: "DEBIT", amount: 3200, description: "AWS Services", timestamp: new Date(Date.now() - 28800000).toISOString(), status: "SUCCESS" },
    { id: 3, type: "CREDIT", amount: 120000, description: "Salary deposit", timestamp: new Date(Date.now() - 86400000).toISOString(), status: "SUCCESS" },
    { id: 4, type: "DEBIT", amount: 8500, description: "Online purchase - Flipkart", timestamp: new Date(Date.now() - 172800000).toISOString(), status: "SUCCESS" },
    { id: 5, type: "DEBIT", amount: 1200, description: "Electricity bill", timestamp: new Date(Date.now() - 259200000).toISOString(), status: "SUCCESS" },
    { id: 6, type: "CREDIT", amount: 12500, description: "Payment from Priya S.", timestamp: new Date(Date.now() - 345600000).toISOString(), status: "SUCCESS" },
    { id: 7, type: "DEBIT", amount: 450, description: "Swiggy order", timestamp: new Date(Date.now() - 518400000).toISOString(), status: "SUCCESS" },
    { id: 8, type: "DEBIT", amount: 2400, description: "Uber ride", timestamp: new Date(Date.now() - 604800000).toISOString(), status: "FAILED" },
  ],
  rewards: { totalPoints: 1847, tier: "GOLD", cashbackEarned: 924.5 },
  rewardHistory: [
    { id: 1, points: 50, reason: "Transfer to Karthik M.", earnedAt: new Date(Date.now() - 7200000).toISOString() },
    { id: 2, points: 120, reason: "Salary deposit", earnedAt: new Date(Date.now() - 86400000).toISOString() },
    { id: 3, points: 85, reason: "Online purchase", earnedAt: new Date(Date.now() - 172800000).toISOString() },
  ],
  notifications: [
    { id: 1, title: "Transfer Successful", message: "Rs.45,000 received from Karthik M.", type: "SUCCESS", read: false, createdAt: new Date(Date.now() - 7200000).toISOString() },
    { id: 2, title: "Reward Points Earned", message: "You earned 50 points on your last transaction!", type: "REWARD", read: false, createdAt: new Date(Date.now() - 28800000).toISOString() },
    { id: 3, title: "Security Alert", message: "New device login detected from Chennai, TN", type: "SECURITY", read: true, createdAt: new Date(Date.now() - 86400000).toISOString() },
    { id: 4, title: "Monthly Statement Ready", message: "Your February 2025 statement is available.", type: "INFO", read: true, createdAt: new Date(Date.now() - 172800000).toISOString() },
  ],
};

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#04050a;--bg2:#080c14;--bg3:#0d1220;--surface:rgba(255,255,255,0.04);
  --border:rgba(255,255,255,0.07);--border-h:rgba(255,255,255,0.14);
  --accent:#6c63ff;--accent2:#a78bfa;--accent3:#38bdf8;--gold:#f5c842;
  --text:#eef2ff;--text2:#8892aa;--text3:#444e65;
  --green:#34d399;--red:#f87171;
  --bnh:64px;
}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--text);font-family:'Outfit',sans-serif;overflow-x:hidden;line-height:1.65}
::selection{background:rgba(108,99,255,0.2)}
::-webkit-scrollbar{width:4px}
::-webkit-scrollbar-track{background:var(--bg2)}
::-webkit-scrollbar-thumb{background:var(--accent);border-radius:2px}
input,select,textarea{background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:10px;color:var(--text);font-family:'Outfit',sans-serif;font-size:14px;outline:none;padding:12px 16px;transition:all 0.2s;width:100%}
input:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(108,99,255,0.1)}
input::placeholder{color:var(--text3)}
button{cursor:pointer;font-family:'Outfit',sans-serif;font-weight:600;transition:all 0.2s}
.btn-p{background:linear-gradient(135deg,var(--accent),#5b52e8);border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:700;padding:12px 24px;box-shadow:0 4px 20px rgba(108,99,255,0.25)}
.btn-p:hover{box-shadow:0 6px 30px rgba(108,99,255,0.4);transform:translateY(-1px)}
.btn-p:disabled{opacity:0.5;cursor:not-allowed;transform:none}
.btn-g{background:transparent;border:1px solid var(--border);border-radius:10px;color:var(--text2);font-size:14px;padding:11px 24px}
.btn-g:hover{border-color:var(--border-h);color:var(--text)}
.btn-d{background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.2);border-radius:10px;color:var(--red);font-size:14px;padding:11px 24px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:24px;transition:border-color 0.2s}
.card:hover{border-color:var(--border-h)}
.badge{border-radius:100px;font-size:11px;font-weight:700;padding:3px 10px}
.bg{background:rgba(52,211,153,0.1);color:var(--green)}
.br{background:rgba(248,113,113,0.1);color:var(--red)}
.ba{background:rgba(108,99,255,0.1);color:var(--accent)}
.lbl{color:var(--text3);font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:6px;display:block}
.gt{background:linear-gradient(135deg,var(--accent) 0%,var(--accent3) 60%,var(--accent2) 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.gc{background:var(--surface);border:1px solid var(--border);border-radius:20px;transition:border-color 0.3s,transform 0.3s}
.gc:hover{border-color:rgba(108,99,255,0.2);transform:translateY(-3px)}
.lt{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--accent);background:rgba(108,99,255,0.08);border:1px solid rgba(108,99,255,0.2);padding:5px 12px;border-radius:100px}
.gbg{background-image:linear-gradient(rgba(108,99,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(108,99,255,0.04) 1px,transparent 1px);background-size:40px 40px;animation:gp 8s linear infinite}
.ai{animation:fu 0.35s ease forwards}
.fu{opacity:0;transform:translateY(28px);transition:opacity 0.65s ease,transform 0.65s ease}
.fu.vis{opacity:1;transform:translateY(0)}
.tw{overflow:hidden;width:100%}
.ti{display:flex;width:max-content;animation:mq 30s linear infinite}
.ti:hover{animation-play-state:paused}
.tit{display:inline-flex;align-items:center;gap:10px;padding:0 32px;white-space:nowrap;color:var(--text3);font-size:13px;font-weight:500}
.nl{color:var(--text2);font-size:14px;font-weight:500;text-decoration:none;background:none;border:none;cursor:pointer;transition:color 0.2s}
.nl:hover{color:var(--text)}
.fi{border-bottom:1px solid var(--border)}
.fq{width:100%;display:flex;justify-content:space-between;align-items:center;padding:20px 0;background:none;border:none;color:var(--text);font-family:'Outfit',sans-serif;font-size:15px;font-weight:600;cursor:pointer;text-align:left;gap:16px}
.fa{overflow:hidden;transition:max-height 0.4s ease,padding 0.3s}
.tc{bottom:80px;display:flex;flex-direction:column;gap:8px;left:50%;pointer-events:none;position:fixed;transform:translateX(-50%);z-index:9999}
.ts{align-items:center;animation:fu 0.3s ease;backdrop-filter:blur(20px);background:var(--bg3);border:1px solid var(--border);border-radius:12px;color:var(--text);display:flex;gap:10px;min-width:280px;padding:14px 18px;pointer-events:all}
.mmenu{display:none;position:fixed;inset:0;background:rgba(4,5,10,0.98);backdrop-filter:blur(20px);z-index:500;flex-direction:column;padding:24px;animation:fu 0.25s ease}
.mmenu.open{display:flex}
.bnav{display:none;position:fixed;bottom:0;left:0;right:0;height:var(--bnh);background:var(--bg2);border-top:1px solid var(--border);z-index:200;align-items:center;justify-content:space-around;padding:0 4px}
.bni{display:flex;flex-direction:column;align-items:center;gap:3px;background:none;border:none;color:var(--text3);padding:8px;border-radius:10px;min-width:48px;position:relative;flex:1}
.bni.act{color:var(--accent)}
.bni span{font-size:9px;font-weight:600}
.bnbadge{position:absolute;top:4px;right:50%;transform:translateX(60%);background:var(--accent);color:#fff;font-size:9px;font-weight:800;min-width:15px;height:15px;border-radius:100px;display:flex;align-items:center;justify-content:center;padding:0 3px}
.sidebar{flex-shrink:0}
@keyframes fu{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes fl{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
@keyframes mq{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes sp{to{transform:rotate(360deg)}}
@keyframes bl{0%,100%{opacity:1}50%{opacity:0}}
@keyframes gp{from{background-position:0 0}to{background-position:40px 40px}}
@media(max-width:768px){
  .tc{bottom:72px;width:90vw}
  .ts{min-width:unset;width:100%}
  .nd{display:none!important}
  .hg{grid-template-columns:1fr!important}
  .hm{display:none!important}
  .sg{grid-template-columns:1fr 1fr!important;gap:14px!important}
  .fg{grid-template-columns:1fr!important}
  .hw{flex-direction:column!important;gap:24px!important}
  .hc{display:none!important}
  .tg{grid-template-columns:1fr!important}
  .fr{grid-template-columns:1fr 1fr!important;gap:24px!important}
  .fb{grid-column:1/-1!important}
  .cb{padding:36px 20px!important}
  .sidebar{display:none!important}
  .bnav{display:flex!important}
  .dmain{padding:16px 14px calc(var(--bnh) + 12px)!important}
  .ds{grid-template-columns:1fr 1fr!important;gap:10px!important}
  .dsv{font-size:15px!important}
  .ba2{font-size:26px!important;letter-spacing:-1px!important}
  .wh{flex-direction:column!important;align-items:flex-start!important}
  .wa{width:100%!important}
  .wa button{flex:1!important;justify-content:center!important}
  .cr{flex-wrap:wrap!important}
  .pw{max-width:100%!important}
  .nw{max-width:100%!important}
  .nhb{display:flex!important}
  .nb{display:none!important}
}
@media(max-width:480px){
  .sg{grid-template-columns:1fr!important}
  .fr{grid-template-columns:1fr!important}
  .ds{grid-template-columns:1fr!important}
}
`;

const fmt = {
  cur: (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n),
  date: (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
  dt: (d) => {
    const diff = Date.now() - new Date(d).getTime();
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return fmt.date(d);
  },
};

function Spin({ s = 18 }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" style={{ animation: "sp 0.7s linear infinite" }}><circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" /><path d="M12 2a10 10 0 0110 10" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" /></svg>;
}

function Ico({ n, s = 18, c }) {
  const ic = {
    home: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
    wallet: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M16 13a1 1 0 100-2 1 1 0 000 2z" fill="currentColor" stroke="none" /><path d="M2 10h20" /></svg>,
    send: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>,
    gift: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><path d="M12 22V7M12 7H7.5a2.5 2.5 0 110-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 100-5C13 2 12 7 12 7z" /></svg>,
    bell: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>,
    user: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
    logout: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>,
    plus: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>,
    up: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>,
    dn: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>,
    chk: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>,
    x: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
    copy: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>,
    eye: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>,
    eye2: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>,
    shield: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
    star: <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
    dl: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
    ul: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>,
    menu: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>,
    arr: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>,
  };
  return <span style={{ color: c || "currentColor", display: "inline-flex", alignItems: "center" }}>{ic[n] || null}</span>;
}

function Logo({ sz = 36, txt = true }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <svg width={sz} height={sz} viewBox="0 0 40 40" fill="none">
        <defs>
          <linearGradient id="lg1" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse"><stop stopColor="#6c63ff" /><stop offset="1" stopColor="#38bdf8" /></linearGradient>
          <linearGradient id="lg2" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse"><stop stopColor="#6c63ff" stopOpacity="0.25" /><stop offset="1" stopColor="#38bdf8" stopOpacity="0.08" /></linearGradient>
        </defs>
        <path d="M20 2L36 11V29L20 38L4 29V11L20 2Z" fill="url(#lg2)" stroke="url(#lg1)" strokeWidth="1.2" />
        <path d="M13 27V13L27 27V13" stroke="url(#lg1)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="27" cy="13" r="2.5" fill="#6c63ff" /><circle cx="13" cy="27" r="2.5" fill="#38bdf8" />
      </svg>
      {txt && <span style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 900, fontSize: sz * 0.72, background: "linear-gradient(135deg,#eef2ff 40%,#6c63ff)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", letterSpacing: "-0.5px" }}>Nova<span style={{ color: "#6c63ff", WebkitTextFillColor: "#6c63ff" }}>Pay</span></span>}
    </div>
  );
}

// Landing page logo — matches the uploaded brand image exactly
// Dark rounded pill background, hexagon icon with N, "Nova" white + "Pay" purple
// function LandingLogo({ sz = 40 }) {
//   // Render the actual brand PNG — height scales with sz, width auto
//   const h = Math.round(sz * 1.375); // logo is 161×55px (ratio ~2.93:1), height = sz*1.375 gives good size
//   return (
//     <img
//       src="data:image/png;base64,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"
//       alt="NovaPay"
//       style={ height: `${h}px`, width: "auto", display: "block", imageRendering: "auto" }
//     />
//   );
// }

const ToastCtx = createContext(null);
function useToast() { return useContext(ToastCtx); }
function ToastProvider({ children }) {
  const [ts, setTs] = useState([]);
  const show = useCallback((msg, type = "info") => {
    const id = Date.now();
    setTs(t => [...t, { id, msg, type }]);
    setTimeout(() => setTs(t => t.filter(x => x.id !== id)), 3500);
  }, []);
  const ic = { success: "✓", error: "✕", info: "ℹ", warning: "⚠" };
  const cl = { success: "#6c63ff", error: "#f87171", info: "#a78bfa", warning: "#f5c842" };
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="tc">{ts.map(t => <div key={t.id} className="ts"><span style={{ color: cl[t.type], fontWeight: 700, fontSize: "16px" }}>{ic[t.type]}</span><span style={{ fontSize: "13px" }}>{t.msg}</span></div>)}</div>
    </ToastCtx.Provider>
  );
}

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ alignItems: "center", background: "rgba(0,0,0,0.75)", backdropFilter: "blur(10px)", bottom: 0, display: "flex", justifyContent: "center", left: 0, padding: "16px", position: "fixed", right: 0, top: 0, zIndex: 8000, transform: "none" }}>
      <div onClick={e => e.stopPropagation()} className="ai" style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "20px", maxWidth: 480, padding: "24px 20px", width: "100%", transform: "none" }}>
        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: "20px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ alignItems: "center", background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text2)", display: "flex", height: "32px", justifyContent: "center", width: "32px" }}><Ico n="x" s={15} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function useFU(ref) {
  const [v, setV] = useState(false);
  useEffect(() => {
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true); }, { threshold: 0.1 });
    if (ref.current) o.observe(ref.current);
    return () => o.disconnect();
  }, []);
  return v;
}
function FadeUp({ children, delay = 0 }) {
  const ref = useRef(null);
  const v = useFU(ref);
  return <div ref={ref} className={`fu${v ? " vis" : ""}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}

function Counter({ target, suffix = "", prefix = "" }) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  const v = useFU(ref);
  useEffect(() => {
    if (!v) return;
    const steps = 55, step = target / steps;
    let cur = 0;
    const t = setInterval(() => { cur = Math.min(cur + step, target); setVal(Math.floor(cur)); if (cur >= target) clearInterval(t); }, 1600 / steps);
    return () => clearInterval(t);
  }, [v]);
  return <span ref={ref}>{prefix}{val.toLocaleString()}{suffix}</span>;
}

// ═══════════════════════════════════════════
//  LANDING
// ═══════════════════════════════════════════
function Landing({ onSignIn }) {
  const [scrolled, setScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);
  const go = (id) => { document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); setMenuOpen(false); };

  const feats = [
    { i: "⚡", t: "Instant Transfers", d: "Send money to anyone in seconds via real-time microservices.", c: "#6c63ff", bg: "rgba(108,99,255,0.08)" },
    { i: "🛡️", t: "Bank-Grade Security", d: "JWT auth, AES-256 encryption, rate limiting, and 2FA.", c: "#38bdf8", bg: "rgba(56,189,248,0.08)" },
    { i: "🌟", t: "Reward Points", d: "Earn points on every transaction. Redeem for cashback.", c: "#f5c842", bg: "rgba(245,200,66,0.08)" },
    { i: "📊", t: "Smart Analytics", d: "Visual spending insights and intelligent budget recommendations.", c: "#a78bfa", bg: "rgba(167,139,250,0.08)" },
    { i: "🔔", t: "Live Notifications", d: "Real-time alerts for every transaction and security event.", c: "#f87171", bg: "rgba(248,113,113,0.08)" },
    { i: "⚙️", t: "API Gateway", d: "Scalable Spring Boot gateway ensuring stability under traffic.", c: "#34d399", bg: "rgba(52,211,153,0.08)" },
  ];
  const stats = [
    { n: 2400000, s: "+", l: "Transactions", p: "" },
    { n: 180000, s: "+", l: "Active Users", p: "" },
    { n: 99.98, s: "%", l: "Uptime", p: "" },
    { n: 850, s: "Cr+", l: "Volume", p: "₹" },
  ];
  const tests = [
    { name: "Arjun Mehta", role: "Freelance Designer", t: "NovaPay changed how I receive payments. Instant, reliable, and the rewards program is genuinely valuable.", a: "A" },
    { name: "Sneha Iyer", role: "E-commerce Founder", t: "We process 500+ transactions daily with zero downtime. The API gateway handles peak loads effortlessly.", a: "S" },
    { name: "Vikram Nair", role: "Software Engineer", t: "JWT + rate limiting means I trust NovaPay with my business finances. Security architecture is top-notch.", a: "V" },
  ];
  const faqs = [
    { q: "How secure is NovaPay?", a: "NovaPay uses JWT authentication, AES-256 encryption, real-time fraud detection, and mandatory 2FA for transactions above Rs.10,000." },
    { q: "How quickly are transfers processed?", a: "Most transfers complete within seconds via our Spring Boot microservices with real-time balance updates." },
    { q: "How do reward points work?", a: "Earn 1 point per Rs.10 transferred. Redeem for cashback at Rs.1 per 2 points, or use for tier upgrades." },
    { q: "Is there a transaction limit?", a: "Free: Rs.50,000/month. Business: Custom limits based on KYC verification." },
    { q: "Can I integrate NovaPay into my app?", a: "Yes! Full REST API access through our documented gateway with webhook support and batch payments." },
  ];
  const tickers = ["Instant Transfers", "Reward Points", "Zero Downtime", "Bank-Grade Security", "Real-Time Notifications", "Smart Analytics", "24/7 Support"];

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Mobile Menu */}
      <div className={`mmenu${menuOpen ? " open" : ""}`}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "36px" }}>
          <Logo sz={32} />
          <button onClick={() => setMenuOpen(false)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--border)", borderRadius: "10px", color: "var(--text)", padding: "9px" }}><Ico n="x" s={20} /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
          {["Features", "FAQ"].map(item => (
            <button key={item} onClick={() => go(item.toLowerCase())} style={{ background: "none", border: "none", borderBottom: "1px solid var(--border)", color: "var(--text)", fontSize: "20px", fontWeight: 700, padding: "16px 0", textAlign: "left" }}>{item}</button>
          ))}
        </div>
        <button onClick={() => { onSignIn(); setMenuOpen(false); }} className="btn-p" style={{ width: "100%", padding: "16px", fontSize: "16px", marginTop: "20px" }}>Sign In</button>
      </div>

      {/* Nav */}
      <nav style={{ alignItems: "center", backdropFilter: scrolled ? "blur(20px)" : "none", background: scrolled ? "rgba(4,5,10,0.85)" : "transparent", borderBottom: scrolled ? "1px solid var(--border)" : "1px solid transparent", display: "flex", justifyContent: "space-between", left: 0, padding: "0 5%", position: "fixed", right: 0, top: 0, transition: "all 0.3s", zIndex: 100, height: "64px" }}>
        <Logo sz={30} />
        <div className="nd" style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          {["Features", "FAQ"].map(item => <button key={item} className="nl" onClick={() => go(item.toLowerCase())}>{item}</button>)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button className="nb nd" onClick={onSignIn} style={{ background: "rgba(108,99,255,0.1)", border: "1px solid rgba(108,99,255,0.25)", borderRadius: "10px", color: "var(--accent)", cursor: "pointer", fontSize: "14px", fontWeight: 700, padding: "10px 20px" }}>Sign In</button>
          <button className="nhb" onClick={() => setMenuOpen(true)} style={{ display: "none", background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", borderRadius: "10px", color: "var(--text)", padding: "9px 10px" }}><Ico n="menu" s={20} /></button>
        </div>
      </nav>

      {/* Hero */}
      <section className="gbg" style={{ minHeight: "100vh", padding: "100px 5% 80px", display: "flex", alignItems: "center" }}>
        <div style={{ maxWidth: "1160px", margin: "0 auto", width: "100%" }}>
          <div className="hg" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "60px", alignItems: "center" }}>
            <div>
              <FadeUp>
                <span className="lt" style={{ marginBottom: "20px" }}>Built on Spring Boot Microservices</span>
                <h1 style={{ fontSize: "clamp(34px,5vw,66px)", fontWeight: 900, letterSpacing: "-2px", lineHeight: 1.05, marginTop: "14px" }}>
                  Payments that<br /><span className="gt">move at the speed</span><br />of your life.
                </h1>
                <p style={{ color: "var(--text2)", fontSize: "clamp(14px,1.8vw,17px)", lineHeight: 1.75, marginTop: "20px", maxWidth: "400px" }}>
                  Next-generation digital payments with instant transfers, reward points, and bank-grade security.
                </p>
                <div style={{ display: "flex", gap: "12px", marginTop: "28px", flexWrap: "wrap" }}>
                  <button onClick={onSignIn} className="btn-p" style={{ fontSize: "15px", padding: "14px 28px", display: "flex", alignItems: "center", gap: "8px" }}>Get Started Free <Ico n="arr" s={15} c="#fff" /></button>
                  <button onClick={() => go("features")} className="btn-g" style={{ fontSize: "15px", padding: "14px 24px" }}>See Features</button>
                </div>
                <div style={{ display: "flex", gap: "24px", marginTop: "26px", flexWrap: "wrap" }}>
                  {[["Rs.850Cr+", "Processed"], ["1.8L+", "Users"], ["99.98%", "Uptime"]].map(([v, l]) => (
                    <div key={l}><div style={{ fontSize: "17px", fontWeight: 800, color: "var(--accent)" }}>{v}</div><div style={{ fontSize: "11px", color: "var(--text3)" }}>{l}</div></div>
                  ))}
                </div>
              </FadeUp>
            </div>
            {/* Hero mock card - hidden mobile */}
            <div className="hm" style={{ display: "flex", justifyContent: "center" }}>
              <FadeUp delay={200}>
                <div style={{ perspective: "1000px" }}>
                  <div style={{ transform: "rotateY(-6deg) rotateX(3deg)", transformStyle: "preserve-3d", animation: "fl 7s ease-in-out infinite" }}>
                    <div style={{ background: "linear-gradient(135deg,#0d1a2e,#0a1525)", border: "1px solid rgba(108,99,255,0.15)", borderRadius: "22px", padding: "24px", width: "290px", boxShadow: "0 40px 80px rgba(0,0,0,0.6), 0 0 60px rgba(108,99,255,0.1)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                        <div><p style={{ color: "var(--text3)", fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "5px" }}>Total Balance</p><p style={{ fontWeight: 900, fontSize: "24px", letterSpacing: "-1.5px", color: "white" }}>Rs.2,84,750</p></div>
                        <Logo sz={22} txt={false} />
                      </div>
                      <div style={{ display: "flex", gap: "3px", alignItems: "flex-end", height: "30px", marginBottom: "14px" }}>
                        {[60, 40, 75, 55, 90, 70, 85, 65, 95, 80].map((h, i) => (
                          <div key={i} style={{ flex: 1, borderRadius: "3px", height: `${h}%`, background: i === 9 ? "var(--accent)" : `rgba(108,99,255,${0.12 + i * 0.02})` }} />
                        ))}
                      </div>
                      {[{ l: "Freelance Payment", a: "+Rs.45,000", c: "#6c63ff" }, { l: "AWS Services", a: "-Rs.3,200", c: "#f87171" }, { l: "Reward Cashback", a: "+Rs.920", c: "#f5c842" }].map((t, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 9px", borderRadius: "8px", background: "rgba(255,255,255,0.03)", marginBottom: "5px" }}>
                          <span style={{ color: "var(--text2)", fontSize: "10px" }}>{t.l}</span>
                          <span style={{ color: t.c, fontSize: "11px", fontWeight: 700 }}>{t.a}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </FadeUp>
            </div>
          </div>
        </div>
      </section>

      {/* Ticker */}
      <div style={{ background: "var(--bg2)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", padding: "13px 0" }}>
        <div className="tw"><div className="ti">{[...tickers, ...tickers].map((t, i) => <span key={i} className="tit"><span style={{ color: "var(--accent)", fontSize: "10px" }}>◆</span>{t}</span>)}</div></div>
      </div>

      {/* Stats */}
      <section style={{ padding: "70px 5%" }}>
        <div style={{ maxWidth: "1160px", margin: "0 auto" }}>
          <div className="sg" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "20px" }}>
            {stats.map((s, i) => (
              <FadeUp key={i} delay={i * 70}>
                <div style={{ textAlign: "center", padding: "16px 10px" }}>
                  <div style={{ fontSize: "clamp(28px,4vw,44px)", fontWeight: 900, letterSpacing: "-2px", background: "linear-gradient(135deg,#fff 60%,var(--accent))", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}><Counter target={s.n} suffix={s.s} prefix={s.p} /></div>
                  <p style={{ color: "var(--text3)", fontSize: "12px", marginTop: "6px" }}>{s.l}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{ background: "var(--bg2)", padding: "70px 5%" }}>
        <div style={{ maxWidth: "1160px", margin: "0 auto" }}>
          <FadeUp><div style={{ textAlign: "center", marginBottom: "44px" }}><span className="lt">Platform Features</span><h2 style={{ fontSize: "clamp(24px,3.5vw,44px)", fontWeight: 800, letterSpacing: "-1px", marginTop: "14px", lineHeight: 1.1 }}>Everything you need.<br /><span className="gt">Nothing you don't.</span></h2></div></FadeUp>
          <div className="fg" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "14px" }}>
            {feats.map((f, i) => (
              <FadeUp key={i} delay={i * 55}>
                <div className="gc" style={{ padding: "22px" }}>
                  <div style={{ width: "46px", height: "46px", borderRadius: "12px", background: f.bg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "14px", fontSize: "20px" }}>{f.i}</div>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "7px" }}>{f.t}</h3>
                  <p style={{ color: "var(--text2)", fontSize: "12px", lineHeight: "1.65" }}>{f.d}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section style={{ padding: "70px 5%" }}>
        <div style={{ maxWidth: "1160px", margin: "0 auto" }}>
          <FadeUp><div style={{ textAlign: "center", marginBottom: "44px" }}><span className="lt">How It Works</span><h2 style={{ fontSize: "clamp(24px,3.5vw,44px)", fontWeight: 800, letterSpacing: "-1px", marginTop: "14px" }}>Simple. Fast. <span className="gt">Secure.</span></h2></div></FadeUp>
          <div className="hw" style={{ display: "flex", gap: "0", position: "relative" }}>
            <div className="hc" style={{ position: "absolute", top: "33px", left: "10%", right: "10%", height: "1px", background: "linear-gradient(90deg,transparent,var(--accent),var(--accent3),var(--accent),transparent)" }} />
            {[{ s: "01", i: "👤", t: "Create Account", d: "Sign up in 60 seconds. Verify your email and go." }, { s: "02", i: "💳", t: "Add Funds", d: "Top up via UPI, net banking, or debit card." }, { s: "03", i: "⚡", t: "Send Instantly", d: "Transfer to any email with full receipt." }, { s: "04", i: "🌟", t: "Earn Rewards", d: "Every transaction earns reward points." }].map((step, i) => (
              <FadeUp key={i} delay={i * 90}>
                <div style={{ flex: 1, textAlign: "center", padding: "0 12px" }}>
                  <div style={{ width: "62px", height: "62px", borderRadius: "50%", background: "var(--bg3)", border: "1px solid rgba(108,99,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: "22px", position: "relative", zIndex: 1 }}>{step.i}</div>
                  <div style={{ color: "var(--text3)", fontSize: "10px", fontFamily: "'JetBrains Mono'", marginBottom: "5px" }}>{step.s}</div>
                  <h3 style={{ fontSize: "13px", fontWeight: 700, marginBottom: "6px" }}>{step.t}</h3>
                  <p style={{ color: "var(--text2)", fontSize: "12px", lineHeight: "1.6" }}>{step.d}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section style={{ background: "var(--bg2)", padding: "70px 5%" }}>
        <div style={{ maxWidth: "1160px", margin: "0 auto" }}>
          <FadeUp><div style={{ textAlign: "center", marginBottom: "44px" }}><span className="lt">Testimonials</span><h2 style={{ fontSize: "clamp(24px,3.5vw,44px)", fontWeight: 800, letterSpacing: "-1px", marginTop: "14px" }}>Trusted by thousands.<br /><span className="gt">Loved by all.</span></h2></div></FadeUp>
          <div className="tg" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "14px" }}>
            {tests.map((t, i) => (
              <FadeUp key={i} delay={i * 70}>
                <div className="gc" style={{ padding: "22px" }}>
                  <div style={{ color: "var(--gold)", fontSize: "13px", letterSpacing: "2px" }}>★★★★★</div>
                  <p style={{ color: "var(--text2)", fontSize: "13px", lineHeight: "1.7", margin: "12px 0 16px" }}>&ldquo;{t.t}&rdquo;</p>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: "linear-gradient(135deg,var(--accent),var(--accent3))", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "13px", color: "#fff" }}>{t.a}</div>
                    <div><p style={{ fontWeight: 600, fontSize: "13px" }}>{t.name}</p><p style={{ color: "var(--text3)", fontSize: "11px" }}>{t.role}</p></div>
                  </div>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={{ padding: "70px 5%" }}>
        <div style={{ maxWidth: "680px", margin: "0 auto" }}>
          <FadeUp><div style={{ textAlign: "center", marginBottom: "44px" }}><span className="lt">FAQ</span><h2 style={{ fontSize: "clamp(24px,3.5vw,44px)", fontWeight: 800, letterSpacing: "-1px", marginTop: "14px" }}>Got questions?<br /><span className="gt">We've got answers.</span></h2></div></FadeUp>
          {faqs.map((faq, i) => (
            <FadeUp key={i} delay={i * 45}>
              <div className="fi">
                <button className="fq" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <span>{faq.q}</span>
                  <span style={{ color: "var(--accent)", fontSize: "20px", flexShrink: 0, transition: "transform 0.3s", transform: openFaq === i ? "rotate(45deg)" : "none" }}>+</span>
                </button>
                <div className="fa" style={{ maxHeight: openFaq === i ? "200px" : "0", paddingBottom: openFaq === i ? "16px" : "0" }}>
                  <p style={{ color: "var(--text2)", fontSize: "14px", lineHeight: "1.7" }}>{faq.a}</p>
                </div>
              </div>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "40px 5% 70px" }}>
        <div style={{ maxWidth: "1160px", margin: "0 auto" }}>
          <FadeUp>
            <div className="cb" style={{ background: "linear-gradient(135deg,rgba(108,99,255,0.1),rgba(56,189,248,0.05),rgba(108,99,255,0.08))", border: "1px solid rgba(108,99,255,0.2)", borderRadius: "22px", padding: "60px 44px", textAlign: "center", position: "relative", overflow: "hidden" }}>
              <span className="lt" style={{ marginBottom: "14px" }}>Start Today - It's Free</span>
              <h2 style={{ fontSize: "clamp(22px,4vw,46px)", fontWeight: 900, letterSpacing: "-1.5px", marginTop: "14px", marginBottom: "12px", lineHeight: 1.1 }}>Ready to experience the<br /><span className="gt">future of payments?</span></h2>
              <p style={{ color: "var(--text2)", fontSize: "15px", maxWidth: "400px", margin: "0 auto 24px", lineHeight: 1.7 }}>Join 1.8 lakh+ users who've switched to NovaPay.</p>
              <button onClick={onSignIn} style={{ alignItems: "center", background: "var(--accent)", border: "none", borderRadius: "12px", boxShadow: "0 4px 28px rgba(108,99,255,0.35)", color: "#fff", cursor: "pointer", display: "inline-flex", fontSize: "15px", fontWeight: 700, gap: "9px", padding: "15px 36px" }}>
                Create Free Account <Ico n="arr" s={15} c="#fff" />
              </button>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: "var(--bg2)", borderTop: "1px solid var(--border)", padding: "48px 5% 28px" }}>
        <div style={{ maxWidth: "1160px", margin: "0 auto" }}>
          <div className="fr" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: "36px", marginBottom: "32px" }}>
            <div className="fb">
              <Logo sz={30} />
              <p style={{ color: "var(--text3)", fontSize: "12px", marginTop: "10px", maxWidth: "230px", lineHeight: 1.7 }}>Next-generation digital payments powered by Spring Boot microservices.</p>
            </div>
            {[{ title: "Product", links: ["Features", "Security", "API Docs"] }, { title: "Company", links: ["About", "Blog", "Careers"] }, { title: "Legal", links: ["Privacy", "Terms", "Compliance"] }].map((col, i) => (
              <div key={i}>
                <p style={{ fontWeight: 700, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "10px", color: "var(--text3)" }}>{col.title}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                  {col.links.map(link => <a key={link} href="#" style={{ color: "var(--text2)", fontSize: "12px", textDecoration: "none" }}>{link}</a>)}
                </div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "18px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
            <p style={{ color: "var(--text3)", fontSize: "12px" }}>2025 NovaPay. Built with Spring Boot microservices.</p>
            <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
              <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "var(--accent)", animation: "bl 2s infinite" }} />
              <p style={{ color: "var(--text3)", fontSize: "12px" }}>All systems operational</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ═══════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════
function Auth({ onLogin, onBack }) {
  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr(""); setLoading(true);
    try {
      if (mode === "login") {
        let res;
        try { res = await api.login(form.email, form.password); }
        catch (e) { setErr(e.message || "Login failed. Check your credentials."); return; }
        // Fetch real user profile from API for accurate name/email
        const claims = parseJwt(res.token);
        let userProfile = null;
        try {
          userProfile = await api.getUser(res.token);
        } catch (_) {}
        const user = {
          id: userProfile?.id || claims?.userId || 1,
          name: userProfile?.name || claims?.name || form.email.split("@")[0],
          email: userProfile?.email || form.email,
          role: claims?.role || "ROLE_USER",
        };
        onLogin(res.token, user);
      } else {
        if (!form.name || !form.email || !form.password) { setErr("Please fill all required fields."); return; }
        try { await api.register(form); }
        catch (e) { setErr(e.message || "Registration failed. Try a different email."); return; }
        // After register, auto-login
        let res;
        try { res = await api.login(form.email, form.password); }
        catch (e) { setErr("Registered! Please sign in."); setMode("login"); return; }
        const claims = parseJwt(res.token);
        let userProfile = null;
        try { userProfile = await api.getUser(res.token); } catch (_) {}
        const user = {
          id: userProfile?.id || claims?.userId || 1,
          name: userProfile?.name || form.name,
          email: userProfile?.email || form.email,
          role: claims?.role || "ROLE_USER",
        };
        onLogin(res.token, user);
      }
    } finally { setLoading(false); }
  };
  const fld = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <div style={{ alignItems: "center", display: "flex", justifyContent: "center", minHeight: "100vh", padding: "20px", position: "relative", overflow: "hidden" }}>
      <div className="gbg" style={{ position: "absolute", inset: 0, opacity: 0.4 }} />
      <div className="ai" style={{ maxWidth: "420px", width: "100%", position: "relative" }}>
        <button onClick={onBack} style={{ alignItems: "center", background: "none", border: "none", color: "var(--text3)", cursor: "pointer", display: "flex", fontSize: "13px", gap: "6px", marginBottom: "22px" }}>← Back to home</button>
        <div style={{ textAlign: "center", marginBottom: "28px" }}><Logo sz={30} /><p style={{ color: "var(--text3)", fontSize: "13px", marginTop: "7px" }}>Next-generation digital payments</p></div>
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: "18px", padding: "24px 20px" }}>
          <div style={{ display: "flex", background: "rgba(255,255,255,0.04)", borderRadius: "10px", padding: "4px", marginBottom: "20px" }}>
            {["login", "register"].map(m => (
              <button key={m} onClick={() => { setMode(m); setErr(""); }} style={{ flex: 1, background: mode === m ? "rgba(108,99,255,0.15)" : "transparent", border: `1px solid ${mode === m ? "rgba(108,99,255,0.3)" : "transparent"}`, borderRadius: "8px", color: mode === m ? "var(--accent)" : "var(--text3)", fontSize: "14px", fontWeight: mode === m ? 700 : 400, padding: "9px" }}>
                {m === "login" ? "Sign In" : "Register"}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {mode === "register" && <div><label className="lbl">Full Name</label><input placeholder="Enter your full name" value={form.name} onChange={fld("name")} /></div>}
            <div><label className="lbl">Email Address</label><input type="email" placeholder="you@example.com" value={form.email} onChange={fld("email")} /></div>
            {mode === "register" && <div><label className="lbl">Phone Number</label><input placeholder="+91 98765 43210" value={form.phone} onChange={fld("phone")} /></div>}
            <div>
              <label className="lbl">Password</label>
              <div style={{ position: "relative" }}>
                <input type={showPass ? "text" : "password"} placeholder="••••••••" value={form.password} onChange={fld("password")} style={{ paddingRight: "44px" }} />
                <button onClick={() => setShowPass(p => !p)} style={{ background: "none", border: "none", color: "var(--text3)", position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)" }}><Ico n={showPass ? "eye2" : "eye"} s={16} /></button>
              </div>
            </div>
            {err && <p style={{ color: "var(--red)", fontSize: "13px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: "8px", padding: "10px 14px" }}>{err}</p>}
            <button className="btn-p" onClick={submit} disabled={loading} style={{ marginTop: "4px", width: "100%", padding: "14px", fontSize: "15px" }}>
              {loading ? <Spin s={17} /> : mode === "login" ? "Sign In" : "Create Account"}
            </button>
            <p style={{ color: "var(--text3)", fontSize: "12px", textAlign: "center" }}>Demo mode: any credentials work offline</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════
function Sidebar({ page, setPage, user, onLogout, nc }) {
  const nav = [
    { id: "dashboard", i: "home", l: "Dashboard" },
    { id: "wallet", i: "wallet", l: "Wallet" },
    { id: "send", i: "send", l: "Send Money" },
    { id: "rewards", i: "gift", l: "Rewards" },
    { id: "notifications", i: "bell", l: "Notifications", b: nc },
    { id: "profile", i: "user", l: "Profile" },
  ];
  return (
    <aside className="sidebar" style={{ background: "var(--bg2)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", height: "100vh", padding: "18px 10px", position: "sticky", top: 0, width: "214px" }}>
      <div style={{ marginBottom: "24px", paddingLeft: "8px" }}><Logo sz={24} /></div>
      <nav style={{ display: "flex", flexDirection: "column", gap: "2px", flex: 1 }}>
        {nav.map(item => {
          const act = page === item.id;
          return (
            <button key={item.id} onClick={() => setPage(item.id)} style={{ alignItems: "center", background: act ? "rgba(108,99,255,0.1)" : "transparent", border: `1px solid ${act ? "rgba(108,99,255,0.2)" : "transparent"}`, borderRadius: "10px", color: act ? "var(--accent)" : "var(--text2)", display: "flex", gap: "9px", padding: "10px 10px", position: "relative", textAlign: "left", width: "100%" }}>
              <Ico n={item.i} s={15} />
              <span style={{ fontSize: "13px", fontWeight: act ? 600 : 400 }}>{item.l}</span>
              {item.b > 0 && <span style={{ background: "var(--accent)", borderRadius: "100px", color: "#fff", fontSize: "9px", fontWeight: 800, marginLeft: "auto", minWidth: "17px", padding: "2px 5px", textAlign: "center" }}>{item.b}</span>}
            </button>
          );
        })}
      </nav>
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "10px" }}>
        <div style={{ alignItems: "center", display: "flex", gap: "8px", marginBottom: "8px", padding: "5px" }}>
          <div style={{ alignItems: "center", background: "linear-gradient(135deg,var(--accent),var(--accent3))", borderRadius: "50%", color: "#fff", display: "flex", fontWeight: 800, fontSize: "11px", height: "30px", justifyContent: "center", width: "30px", flexShrink: 0 }}>
            {(user?.name || user?.email || "U")[0].toUpperCase()}
          </div>
          <div style={{ overflow: "hidden" }}>
            <p style={{ fontSize: "12px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)" }}>
              {user?.name || "User"}
            </p>
            <p style={{ color: "var(--text3)", fontSize: "10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.email}</p>
          </div>
        </div>
        <button onClick={onLogout} className="btn-g" style={{ alignItems: "center", display: "flex", gap: "7px", width: "100%", justifyContent: "center", padding: "7px", fontSize: "12px" }}><Ico n="logout" s={12} /> Sign Out</button>
      </div>
    </aside>
  );
}

function BotNav({ page, setPage, nc }) {
  const nav = [
    { id: "dashboard", i: "home", l: "Home" },
    { id: "wallet", i: "wallet", l: "Wallet" },
    { id: "send", i: "send", l: "Send" },
    { id: "rewards", i: "gift", l: "Rewards" },
    { id: "profile", i: "user", l: "Profile" },
  ];
  return (
    <nav className="bnav">
      {nav.map(item => (
        <button key={item.id} onClick={() => setPage(item.id)} className={`bni${page === item.id ? " act" : ""}`}>
          {item.id === "notifications" && nc > 0 && <span className="bnbadge">{nc}</span>}
          <Ico n={item.i} s={19} />
          <span>{item.l}</span>
        </button>
      ))}
    </nav>
  );
}

function TxRow({ tx }) {
  const cr = tx.type === "CREDIT", fl = tx.status === "FAILED";
  return (
    <div style={{ alignItems: "center", borderRadius: "10px", display: "flex", gap: "11px", padding: "11px 10px", transition: "background 0.15s" }}
      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      <div style={{ alignItems: "center", background: fl ? "rgba(248,113,113,0.1)" : cr ? "rgba(52,211,153,0.1)" : "rgba(108,99,255,0.08)", borderRadius: "10px", color: fl ? "var(--red)" : cr ? "var(--green)" : "var(--accent)", display: "flex", flexShrink: 0, height: "36px", justifyContent: "center", width: "36px" }}>
        <Ico n={fl ? "x" : cr ? "dn" : "up"} s={15} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "13px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.description}</p>
        <p style={{ color: "var(--text3)", fontSize: "11px" }}>{fmt.dt(tx.timestamp)}</p>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <p style={{ color: fl ? "var(--red)" : cr ? "var(--green)" : "var(--text)", fontSize: "13px", fontWeight: 700 }}>{cr ? "+" : "-"}{fmt.cur(tx.amount)}</p>
        <span className={`badge ${fl ? "br" : "bg"}`} style={{ fontSize: "9px" }}>{tx.status}</span>
      </div>
    </div>
  );
}

function DashPage({ wallet, transactions, rewards, setPage }) {
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]   = useState("");

  const spent = transactions.filter(t => t.type === "DEBIT" && t.status === "SUCCESS").reduce((s, t) => s + t.amount, 0);
  const recv  = transactions.filter(t => t.type === "CREDIT").reduce((s, t) => s + t.amount, 0);

  const hasFilter = search.trim() || dateFrom || dateTo;

  const filtered = transactions.filter(tx => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q || (
      (tx.description || "").toLowerCase().includes(q) ||
      String(tx.amount).includes(q) ||
      (tx.status || "").toLowerCase().includes(q)
    );
    const txDate = tx.timestamp ? new Date(tx.timestamp) : null;
    const matchFrom = !dateFrom || (txDate && txDate >= new Date(dateFrom));
    const matchTo   = !dateTo   || (txDate && txDate <= new Date(dateTo + "T23:59:59"));
    return matchSearch && matchFrom && matchTo;
  });

  const clearFilters = () => { setSearch(""); setDateFrom(""); setDateTo(""); };

  const inputBase = {
    background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)",
    borderRadius: "10px", color: "var(--text)", fontFamily: "'Outfit',sans-serif",
    fontSize: "13px", outline: "none", padding: "9px 13px", transition: "border-color 0.2s",
  };

  return (
    <div className="ai" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <div><h1 style={{ fontSize: "20px", fontWeight: 800 }}>Dashboard</h1><p style={{ color: "var(--text3)", fontSize: "12px", marginTop: "2px" }}>Welcome back!</p></div>

      {/* ── Filter bar — single horizontal row ── */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "12px 16px", display: "flex", alignItems: "center", gap: "10px", overflow: "hidden" }}>
        {/* Search — grows to fill available space */}
        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
          <span style={{ color: "var(--text3)", left: "11px", position: "absolute", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input
            placeholder="Search by name, amount, or status…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inputBase, paddingLeft: "32px", width: "100%", boxSizing: "border-box" }}
            onFocus={e => e.target.style.borderColor = "var(--accent)"}
            onBlur={e => e.target.style.borderColor = "var(--border)"}
          />
        </div>
        {/* Divider */}
        <div style={{ width: "1px", height: "28px", background: "var(--border)", flexShrink: 0 }} />
        {/* Date range — fixed width, no wrap */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          <span style={{ color: "var(--text3)", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" }}>From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            style={{ ...inputBase, padding: "8px 10px", width: "140px", colorScheme: "dark", boxSizing: "border-box" }}
            onFocus={e => e.target.style.borderColor = "var(--accent)"}
            onBlur={e => e.target.style.borderColor = "var(--border)"}
          />
          <span style={{ color: "var(--text3)", fontSize: "12px" }}>–</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            style={{ ...inputBase, padding: "8px 10px", width: "140px", colorScheme: "dark", boxSizing: "border-box" }}
            onFocus={e => e.target.style.borderColor = "var(--accent)"}
            onBlur={e => e.target.style.borderColor = "var(--border)"}
          />
        </div>
        {/* Clear button — only when active */}
        {hasFilter && (
          <>
            <div style={{ width: "1px", height: "28px", background: "var(--border)", flexShrink: 0 }} />
            <button
              onClick={clearFilters}
              style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: "9px", color: "var(--red)", cursor: "pointer", fontSize: "12px", fontWeight: 600, padding: "8px 13px", whiteSpace: "nowrap", flexShrink: 0, transition: "background 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(248,113,113,0.16)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(248,113,113,0.08)"}
            >✕ Clear</button>
          </>
        )}
      </div>

      {/* ── Balance card ── */}
      <div style={{ background: "linear-gradient(135deg,rgba(108,99,255,0.12),rgba(56,189,248,0.06))", border: "1px solid rgba(108,99,255,0.18)", borderRadius: "16px", padding: "22px", position: "relative", overflow: "hidden" }}>
        <div style={{ background: "radial-gradient(ellipse 280px 180px at 80% 50%,rgba(108,99,255,0.1),transparent)", inset: 0, position: "absolute" }} />
        <div style={{ position: "relative" }}>
          <span className="lbl">Total Balance</span>
          <div className="ba2" style={{ fontSize: "36px", fontWeight: 900, letterSpacing: "-1.5px", marginTop: "3px" }}>
            <span style={{ color: "var(--text3)", fontSize: "16px" }}>Rs.</span>{wallet.balance.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          </div>
          <p style={{ color: "var(--text3)", fontSize: "11px", marginTop: "3px" }}>Wallet ID: {wallet.walletId}</p>
          <div style={{ display: "flex", gap: "10px", marginTop: "14px", flexWrap: "wrap" }}>
            <button className="btn-p" onClick={() => setPage("send")} style={{ alignItems: "center", display: "flex", gap: "6px", fontSize: "13px", padding: "9px 16px" }}><Ico n="send" s={13} c="#fff" /> Send Money</button>
            <button className="btn-g" onClick={() => setPage("wallet")} style={{ alignItems: "center", display: "flex", gap: "6px", fontSize: "13px", padding: "9px 16px" }}><Ico n="plus" s={13} /> Add Funds</button>
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="ds" style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(3,1fr)" }}>
        {[
          { l: "Money Sent",     v: fmt.cur(spent), i: "up",   c: "var(--accent)" },
          { l: "Money Received", v: fmt.cur(recv),  i: "dn",   c: "var(--green)"  },
          { l: "Reward Points",  v: rewards.totalPoints.toLocaleString(), i: "star", c: "var(--gold)", s: rewards.tier },
        ].map((stat, i) => (
          <div key={i} className="card" style={{ padding: "16px" }}>
            <div style={{ alignItems: "flex-start", display: "flex", justifyContent: "space-between" }}>
              <div style={{ minWidth: 0 }}>
                <span className="lbl">{stat.l}</span>
                <div className="dsv" style={{ fontSize: "16px", fontWeight: 900, marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stat.v}</div>
                {stat.s && <p style={{ color: "var(--text3)", fontSize: "10px", marginTop: "1px" }}>{stat.s}</p>}
              </div>
              <div style={{ alignItems: "center", background: `${stat.c}12`, borderRadius: "9px", color: stat.c, display: "flex", flexShrink: 0, height: "34px", justifyContent: "center", width: "34px" }}><Ico n={stat.i} s={15} /></div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Charts ── */}
      {transactions.length > 0 && (() => {
        // ── Spending by Category: bucket by amount size ──────────────
        const debitTxs = transactions.filter(t => t.type === "DEBIT" && t.status !== "FAILED");
        const catMap = {};
        debitTxs.forEach(tx => {
          const cat = tx.amount >= 5000 ? "Large Transfer"
                    : tx.amount >= 1000 ? "Standard"
                    : tx.amount >= 200  ? "Regular"
                    : "Small Payment";
          catMap[cat] = (catMap[cat] || 0) + tx.amount;
        });
        const catColors = { "Large Transfer": "#6c63ff", "Standard": "#38bdf8", "Regular": "#34d399", "Small Payment": "#f5c842" };
        const cats = Object.entries(catMap).sort((a,b) => b[1]-a[1]);
        const totalDebit = cats.reduce((s,[,v]) => s+v, 0) || 1;

        // ── Monthly Trends: last 6 months ────────────────────────────
        const now = new Date();
        const months = Array.from({ length: 6 }, (_, i) => {
          const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
          return { label: d.toLocaleString("en-IN", { month: "short" }), year: d.getFullYear(), month: d.getMonth() };
        });
        const monthData = months.map(m => {
          const inMonth = tx => {
            const d = tx.timestamp ? new Date(tx.timestamp) : null;
            return d && d.getFullYear() === m.year && d.getMonth() === m.month;
          };
          const s = transactions.filter(tx => tx.type === "DEBIT"  && tx.status !== "FAILED" && inMonth(tx)).reduce((a,t)=>a+t.amount,0);
          const r = transactions.filter(tx => tx.type === "CREDIT" && inMonth(tx)).reduce((a,t)=>a+t.amount,0);
          return { ...m, sent: s, recv: r };
        });
        const maxVal = Math.max(...monthData.flatMap(m => [m.sent, m.recv]), 1);
        const BAR_W = 18, BAR_GAP = 6, GROUP_GAP = 28;
        const chartW = months.length * (BAR_W * 2 + BAR_GAP + GROUP_GAP);
        const chartH = 120;

        return (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }} className="hg">

            {/* Spending by Category */}
            <div className="card" style={{ padding: "18px" }}>
              <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "14px" }}>Spending by Category</h3>
              {cats.length === 0
                ? <p style={{ color: "var(--text3)", fontSize: "13px" }}>No spending data yet.</p>
                : <>
                    {/* Stacked bar */}
                    <div style={{ display: "flex", height: "10px", borderRadius: "100px", overflow: "hidden", marginBottom: "16px", gap: "2px" }}>
                      {cats.map(([cat, val]) => (
                        <div key={cat} style={{ background: catColors[cat] || "#6c63ff", width: `${(val/totalDebit)*100}%`, minWidth: "3px", borderRadius: "100px", transition: "width 0.6s ease" }} />
                      ))}
                    </div>
                    {/* Legend rows */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {cats.map(([cat, val]) => (
                        <div key={cat} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: catColors[cat] || "#6c63ff", flexShrink: 0 }} />
                            <span style={{ fontSize: "13px", color: "var(--text2)" }}>{cat}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontSize: "11px", color: "var(--text3)" }}>{Math.round(val/totalDebit*100)}%</span>
                            <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>{fmt.cur(val)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
              }
            </div>

            {/* Monthly Trends */}
            <div className="card" style={{ padding: "18px" }}>
              <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "14px" }}>Monthly Trends</h3>
              <div style={{ overflowX: "auto" }}>
                <svg width="100%" viewBox={`0 0 ${chartW + 20} ${chartH + 36}`} style={{ minWidth: "240px", display: "block" }}>
                  {/* Grid lines */}
                  {[0,0.25,0.5,0.75,1].map((r, i) => (
                    <line key={i} x1="0" y1={chartH - r*chartH} x2={chartW+20} y2={chartH - r*chartH}
                      stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                  ))}
                  {/* Bars */}
                  {monthData.map((m, i) => {
                    const x = i * (BAR_W * 2 + BAR_GAP + GROUP_GAP) + GROUP_GAP / 2;
                    const sentH  = Math.max((m.sent / maxVal) * chartH, m.sent  > 0 ? 3 : 0);
                    const recvH  = Math.max((m.recv / maxVal) * chartH, m.recv  > 0 ? 3 : 0);
                    return (
                      <g key={i}>
                        {/* Sent bar */}
                        <rect x={x} y={chartH - sentH} width={BAR_W} height={sentH}
                          rx="4" fill="rgba(108,99,255,0.85)" />
                        {/* Recv bar */}
                        <rect x={x + BAR_W + BAR_GAP} y={chartH - recvH} width={BAR_W} height={recvH}
                          rx="4" fill="rgba(52,211,153,0.85)" />
                        {/* Month label */}
                        <text x={x + BAR_W + BAR_GAP/2} y={chartH + 16} textAnchor="middle"
                          fill="rgba(255,255,255,0.35)" fontSize="11" fontFamily="Outfit,sans-serif">{m.label}</text>
                      </g>
                    );
                  })}
                </svg>
              </div>
              {/* Legend */}
              <div style={{ display: "flex", gap: "18px", marginTop: "8px" }}>
                {[["Sent", "rgba(108,99,255,0.85)"], ["Received", "rgba(52,211,153,0.85)"]].map(([label, color]) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <div style={{ width: "10px", height: "10px", borderRadius: "3px", background: color }} />
                    <span style={{ fontSize: "12px", color: "var(--text3)" }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        );
      })()}

      {/* ── Recent Activity ── */}
      <div className="card" style={{ padding: "18px" }}>
        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 700 }}>Recent Activity</h3>
            {hasFilter && (
              <span style={{ background: "rgba(108,99,255,0.1)", border: "1px solid rgba(108,99,255,0.2)", borderRadius: "100px", color: "var(--accent)", fontSize: "11px", fontWeight: 700, padding: "2px 9px" }}>
                {filtered.length} result{filtered.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <button onClick={() => setPage("wallet")} style={{ background: "none", border: "none", color: "var(--accent)", fontSize: "12px" }}>View all →</button>
        </div>
        {filtered.length === 0
          ? <div style={{ color: "var(--text3)", fontSize: "13px", padding: "20px 0", textAlign: "center" }}>No transactions match your filters.</div>
          : (hasFilter ? filtered : transactions.slice(0, 5)).map(tx => <TxRow key={tx.id} tx={tx} />)
        }
      </div>
    </div>
  );
}

function WalletPage({ wallet, transactions, onRefresh, onAddFunds, onWithdraw }) {
  const [filter, setFilter] = useState("ALL"), [copied, setCopied] = useState(false);

  const filtered = filter === "ALL" ? transactions : transactions.filter(t => t.type === filter);
  return (
    <div className="ai" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <div><h1 style={{ fontSize: "20px", fontWeight: 800 }}>Wallet</h1><p style={{ color: "var(--text3)", fontSize: "12px", marginTop: "2px" }}>Manage your funds & transactions</p></div>
      <div className="card" style={{ background: "rgba(108,99,255,0.04)", border: "1px solid rgba(108,99,255,0.12)" }}>
        <div className="wh" style={{ alignItems: "center", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "14px" }}>
          <div>
            <span className="lbl">Available Balance</span>
            <div style={{ fontSize: "28px", fontWeight: 900, letterSpacing: "-1.5px" }}>{fmt.cur(wallet.balance)}</div>
            <div style={{ alignItems: "center", display: "flex", gap: "6px", marginTop: "6px" }}>
              <code style={{ background: "rgba(255,255,255,0.05)", borderRadius: "6px", color: "var(--text2)", fontSize: "11px", padding: "3px 7px" }}>{wallet.walletId}</code>
              <button onClick={() => { navigator.clipboard.writeText(wallet.walletId); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{ background: "none", border: "none", color: "var(--text3)" }}>
                {copied ? <Ico n="chk" s={13} c="var(--green)" /> : <Ico n="copy" s={13} />}
              </button>
            </div>
          </div>
          <div className="wa" style={{ display: "flex", gap: "10px" }}>
            <button className="btn-p" onClick={onAddFunds} style={{ alignItems: "center", display: "flex", gap: "6px", fontSize: "13px" }}><Ico n="dl" s={13} c="#fff" /> Add Funds</button>
            <button className="btn-g" onClick={onWithdraw} style={{ alignItems: "center", display: "flex", gap: "6px", fontSize: "13px" }}><Ico n="ul" s={13} /> Withdraw</button>
          </div>
        </div>
      </div>
      <div className="card" style={{ padding: "18px" }}>
        <div style={{ alignItems: "center", display: "flex", gap: "10px", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap" }}>
          <h3 style={{ fontSize: "14px", fontWeight: 700 }}>Transaction History</h3>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {["ALL", "CREDIT", "DEBIT"].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ background: filter === f ? "rgba(108,99,255,0.12)" : "transparent", border: `1px solid ${filter === f ? "rgba(108,99,255,0.3)" : "var(--border)"}`, borderRadius: "8px", color: filter === f ? "var(--accent)" : "var(--text3)", fontSize: "12px", padding: "5px 11px", whiteSpace: "nowrap" }}>
                {f === "ALL" ? "All" : f === "CREDIT" ? "Received" : "Sent"}
              </button>
            ))}
          </div>
        </div>
        {filtered.map(tx => <TxRow key={tx.id} tx={tx} />)}
      </div>
    </div>
  );
}

function RewardEarnedCard({ reward, onClose }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 80); return () => clearTimeout(t); }, []);
  if (!reward) return null;
  const earnedAt = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9000,
        background: "rgba(4,5,10,0.88)",
        backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px",
        opacity: visible ? 1 : 0, transition: "opacity 0.3s ease",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: "360px",
          background: "var(--bg2)",
          border: "1px solid var(--border-h)",
          borderRadius: "24px", padding: "32px 24px 24px", textAlign: "center",
          boxShadow: "0 0 0 1px rgba(108,99,255,0.10), 0 32px 64px rgba(0,0,0,0.7)",
          transform: visible ? "translateY(0) scale(1)" : "translateY(36px) scale(0.92)",
          transition: "transform 0.45s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease",
          opacity: visible ? 1 : 0,
        }}
      >
        <div style={{ position: "relative", width: "70px", height: "70px", margin: "0 auto 18px" }}>
          <div style={{ position: "absolute", inset: "-8px", borderRadius: "50%", background: "radial-gradient(circle, rgba(108,99,255,0.22) 0%, transparent 72%)" }} />
          <div style={{ width: "70px", height: "70px", borderRadius: "50%", background: "linear-gradient(135deg, rgba(108,99,255,0.16), rgba(56,189,248,0.10))", border: "1.5px solid rgba(108,99,255,0.28)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "32px" }}>🎉</div>
        </div>
        <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "1.4px", textTransform: "uppercase", color: "var(--accent2)", marginBottom: "6px" }}>Reward Earned</p>
        <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--text)", marginBottom: "16px" }}>You've got points!</h2>
        <div style={{ display: "inline-flex", alignItems: "baseline", gap: "5px", background: "linear-gradient(135deg, rgba(108,99,255,0.13), rgba(56,189,248,0.07))", border: "1px solid rgba(108,99,255,0.22)", borderRadius: "100px", padding: "10px 32px", marginBottom: "14px" }}>
          <span style={{ fontSize: "44px", fontWeight: 900, color: "var(--accent2)", lineHeight: 1 }}>+{reward.newPoints}</span>
          <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--text2)" }}>pts</span>
        </div>
        <p style={{ fontSize: "13px", color: "var(--text3)", marginBottom: "20px", lineHeight: 1.5 }}>You earned reward points for your transaction!</p>
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: "12px", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <span style={{ fontSize: "13px", color: "var(--text2)", fontWeight: 500 }}>Transaction Reward</span>
          <span style={{ fontSize: "13px", color: "var(--text)", fontWeight: 700 }}>{earnedAt}</span>
        </div>
        <div style={{ display: "flex", gap: "8px", marginBottom: "22px" }}>
          {[
            { label: "Total Points", value: reward.totalPoints.toLocaleString(), color: "var(--accent2)" },
            { label: "Cashback", value: fmt.cur(Math.round(reward.newPoints * 0.10)), color: "var(--green)" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: "10px", padding: "10px 8px" }}>
              <p style={{ fontSize: "10px", color: "var(--text3)", marginBottom: "4px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.7px" }}>{label}</p>
              <p style={{ fontSize: "16px", fontWeight: 800, color }}>{value}</p>
            </div>
          ))}
        </div>
        <button
          onClick={onClose}
          style={{ width: "100%", padding: "14px", background: "linear-gradient(135deg, var(--accent), #5b52e8)", border: "none", borderRadius: "12px", fontSize: "15px", fontWeight: 700, color: "#fff", cursor: "pointer", boxShadow: "0 4px 20px rgba(108,99,255,0.35)", transition: "transform 0.15s ease, box-shadow 0.15s ease" }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 28px rgba(108,99,255,0.45)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 4px 20px rgba(108,99,255,0.35)"; }}
        >Awesome! 🎊</button>
      </div>
    </div>
  );
}

function SendPage({ wallet, onRefresh, onReward }) {
  const toast = useToast(); const { token } = useAuth();
  const [step, setStep] = useState(1), [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ receiverId: "", amount: "", note: "" }), [txRes, setTxRes] = useState(null);
  const [err, setErr] = useState("");
  const [fetchingReward, setFetchingReward] = useState(false);
  const fld = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const fetchRewardAfterTx = async (txId, amt) => {
    setFetchingReward(true);
    // 10% of sent amount = reward points, minimum 1
    const calcPoints = Math.max(1, Math.round(amt * 0.10));
    try {
      const rewardList = await api.getRewards(token);
      if (Array.isArray(rewardList) && rewardList.length > 0) {
        const totalPoints = rewardList.reduce((s, x) => s + (x.points || 0), 0);
        const tier = totalPoints >= 10000 ? "DIAMOND" : totalPoints >= 5000 ? "PLATINUM" : totalPoints >= 1000 ? "GOLD" : totalPoints >= 500 ? "SILVER" : "BRONZE";
        onReward({ newPoints: calcPoints, totalPoints, tier });
      } else {
        onReward({ newPoints: calcPoints, totalPoints: calcPoints, tier: "BRONZE" });
      }
    } catch {
      onReward({ newPoints: calcPoints, totalPoints: calcPoints, tier: "BRONZE" });
    } finally { setFetchingReward(false); }
  };

  const send = async () => {
    setErr(""); setLoading(true);
    try {
      const res = await api.sendMoney({ receiverId: +form.receiverId, amount: +form.amount }, token);
      setTxRes(res); setStep(3); onRefresh();
      toast("Transfer successful!", "success");
      fetchRewardAfterTx(res?.transactionId || res?.id, +form.amount);
    } catch (e) {
      setErr(e.message || "Transfer failed. Please try again.");
      setStep(1);
    } finally { setLoading(false); }
  };
  const reset = () => { setStep(1); setForm({ receiverId: "", amount: "", note: "" }); setTxRes(null); setErr(""); };

  return (
    <div className="ai" style={{ display: "flex", flexDirection: "column", gap: "20px", width: "100%", maxWidth: "460px", margin: "0 auto" }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 800 }}>Send Money</h1>
        <p style={{ color: "var(--text3)", fontSize: "13px", marginTop: "5px" }}>Transfer funds to other users securely</p>
      </div>
      {step === 1 && (
        <div className="card" style={{ padding: "20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label className="lbl">Recipient User ID</label>
              <input type="number" placeholder="Enter recipient user ID (e.g. 2)" value={form.receiverId} onChange={fld("receiverId")} />
              <p style={{ color: "var(--text3)", fontSize: "11px", marginTop: "4px" }}>Ask the recipient for their NovaPay user ID</p>
            </div>
            <div>
              <label className="lbl">Amount (INR)</label>
              <div style={{ position: "relative" }}>
                <span style={{ color: "var(--text3)", left: "14px", position: "absolute", top: "50%", transform: "translateY(-50%)" }}>Rs.</span>
                <input type="number" placeholder="0.00" value={form.amount} onChange={fld("amount")} style={{ paddingLeft: "34px" }} />
              </div>
              <p style={{ color: "var(--text3)", fontSize: "11px", marginTop: "4px" }}>Available: {fmt.cur(wallet.balance)}</p>
            </div>
            <div><label className="lbl">Note (optional)</label><input placeholder="What's this for?" value={form.note} onChange={fld("note")} /></div>
            {err && <p style={{ color: "var(--red)", fontSize: "13px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: "8px", padding: "10px 14px" }}>{err}</p>}
            <button className="btn-p" onClick={() => setStep(2)} disabled={!form.receiverId || !form.amount || +form.amount <= 0} style={{ width: "100%", padding: "13px" }}>Continue</button>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="card ai" style={{ padding: "20px" }}>
          <h3 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "14px" }}>Confirm Transfer</h3>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {[["To", `User #${form.receiverId}`], ["Amount", fmt.cur(+form.amount)], ["Note", form.note || "—"], ["Balance After", fmt.cur(wallet.balance - +form.amount)]].map(([label, val], i) => (
              <div key={i} style={{ alignItems: "center", display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ color: "var(--text3)", fontSize: "13px" }}>{label}</span>
                <span style={{ color: i === 1 ? "var(--accent)" : "var(--text)", fontWeight: i === 1 ? 800 : 500, fontSize: i === 1 ? "15px" : "13px", maxWidth: "55%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>{val}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "10px", marginTop: "18px" }}>
            <button className="btn-g" onClick={() => setStep(1)} style={{ flex: 1 }}>Back</button>
            <button className="btn-p" onClick={send} disabled={loading} style={{ flex: 2, padding: "13px" }}>{loading ? <Spin /> : "Confirm & Send"}</button>
          </div>
        </div>
      )}
      {step === 3 && (
        <div className="card ai" style={{ textAlign: "center", padding: "36px 28px" }}>
          <div style={{ alignItems: "center", background: "rgba(52,211,153,0.1)", border: "2px solid rgba(52,211,153,0.25)", borderRadius: "50%", color: "var(--green)", display: "flex", height: "64px", justifyContent: "center", margin: "0 auto 16px", width: "64px" }}><Ico n="chk" s={28} /></div>
          <h2 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "6px" }}>Transfer Successful!</h2>
          <p style={{ color: "var(--text3)", fontSize: "13px", marginBottom: "10px" }}>{fmt.cur(+form.amount)} sent to User #{form.receiverId}</p>
          <code style={{ background: "rgba(255,255,255,0.05)", borderRadius: "8px", color: "var(--text3)", fontSize: "11px", padding: "4px 12px" }}>Ref: {txRes?.transactionId}</code>
          {fetchingReward && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "center", color: "var(--text3)", fontSize: "12px", marginTop: "16px" }}>
              <Spin s={13} /> Calculating reward points…
            </div>
          )}
          <div style={{ display: "flex", gap: "10px", marginTop: "24px" }}>
            <button className="btn-g" onClick={reset} style={{ flex: 1 }}>New Transfer</button>
            <button className="btn-p" onClick={reset} style={{ flex: 1 }}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

function RewardsPage({ rewards, rewardHistory }) {
  const tiers = [{ n: "BRONZE", min: 0, c: "#cd7f32" }, { n: "SILVER", min: 500, c: "#9ca3af" }, { n: "GOLD", min: 1000, c: "#fbbf24" }, { n: "PLATINUM", min: 5000, c: "#a78bfa" }, { n: "DIAMOND", min: 10000, c: "#38bdf8" }];
  const cur = tiers.find(t => t.n === rewards.tier) || tiers[0];
  const nxt = tiers[tiers.findIndex(t => t.n === rewards.tier) + 1];
  const prog = nxt ? ((rewards.totalPoints - cur.min) / (nxt.min - cur.min)) * 100 : 100;
  return (
    <div className="ai" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <div><h1 style={{ fontSize: "20px", fontWeight: 800 }}>Rewards</h1><p style={{ color: "var(--text3)", fontSize: "12px", marginTop: "2px" }}>Earn points on every transaction</p></div>
      <div style={{ background: `linear-gradient(135deg,${cur.c}15,rgba(255,255,255,0.02))`, border: `1px solid ${cur.c}25`, borderRadius: "16px", padding: "20px" }}>
        <div style={{ alignItems: "center", display: "flex", gap: "12px", marginBottom: "14px" }}>
          <div style={{ alignItems: "center", background: `${cur.c}18`, border: `1px solid ${cur.c}35`, borderRadius: "50%", color: cur.c, display: "flex", height: "42px", justifyContent: "center", width: "42px" }}><Ico n="star" s={19} /></div>
          <div><p style={{ color: "var(--text3)", fontSize: "11px", textTransform: "uppercase" }}>Current Tier</p><h2 style={{ fontSize: "19px", fontWeight: 800, color: cur.c }}>{cur.n}</h2></div>
        </div>
        <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "1fr 1fr", marginBottom: "14px" }}>
          <div><p style={{ color: "var(--text3)", fontSize: "12px" }}>Total Points</p><p style={{ fontSize: "22px", fontWeight: 900 }}>{rewards.totalPoints.toLocaleString()}</p></div>
          <div><p style={{ color: "var(--text3)", fontSize: "12px" }}>Cashback Earned</p><p style={{ fontSize: "22px", fontWeight: 900 }}>{fmt.cur(rewards.cashbackEarned)}</p></div>
        </div>
        {nxt && <div>
          <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
            <span style={{ color: "var(--text3)", fontSize: "12px" }}>Progress to {nxt.n}</span>
            <span style={{ color: cur.c, fontSize: "11px", fontWeight: 600 }}>{rewards.totalPoints.toLocaleString()} / {nxt.min.toLocaleString()} pts</span>
          </div>
          <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: "100px", height: "7px" }}>
            <div style={{ background: `linear-gradient(90deg,${cur.c},${nxt.c})`, borderRadius: "100px", height: "100%", width: `${Math.min(prog, 100)}%`, transition: "width 1s ease" }} />
          </div>
        </div>}
      </div>
      <div className="card" style={{ padding: "18px" }}>
        <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px" }}>Points History</h3>
        {rewardHistory.length === 0
          ? <p style={{ color: "var(--text3)", fontSize: "13px", padding: "10px 0" }}>No reward history yet.</p>
          : rewardHistory.map(r => (
            <div key={r.id} style={{ alignItems: "center", borderBottom: "1px solid var(--border)", display: "flex", gap: "10px", padding: "10px 0" }}>
              <div style={{ alignItems: "center", background: "rgba(245,200,66,0.08)", borderRadius: "9px", color: "var(--gold)", display: "flex", height: "32px", justifyContent: "center", width: "32px" }}><Ico n="star" s={13} /></div>
              <div style={{ flex: 1, minWidth: 0 }}><p style={{ fontSize: "13px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.reason}</p><p style={{ color: "var(--text3)", fontSize: "11px" }}>{fmt.dt(r.earnedAt)}</p></div>
              <span style={{ color: "var(--gold)", fontWeight: 800, fontSize: "12px", flexShrink: 0 }}>+{r.points} pts</span>
            </div>
          ))
        }
      </div>

      {/* ── Redeem Your Points ── */}
      {(() => {
        const OFFERS = [
          { emoji: "🛍️", cat: "SHOPPING",       name: "Amazon Voucher",    desc: "₹100 Amazon Gift Card",      pts: 10000  },
          { emoji: "☕", cat: "FOOD & BEVERAGE", name: "Starbucks Coffee",  desc: "Free Premium Coffee",        pts: 5000   },
          { emoji: "🚗", cat: "TRAVEL",          name: "Uber Ride",         desc: "₹150 Uber Ride Credit",      pts: 7500   },
          { emoji: "🎬", cat: "ENTERTAINMENT",   name: "Movie Tickets",     desc: "2 Cinema Tickets",           pts: 12000  },
          { emoji: "📱", cat: "UTILITY",         name: "Mobile Recharge",   desc: "₹50 Mobile Recharge",        pts: 3000   },
          { emoji: "📦", cat: "SHOPPING",        name: "Flipkart Voucher",  desc: "₹200 Shopping Voucher",      pts: 20000  },
          { emoji: "🍕", cat: "FOOD & BEVERAGE", name: "Swiggy Discount",   desc: "₹75 off on Swiggy order",    pts: 6000   },
          { emoji: "✈️", cat: "TRAVEL",          name: "Flight Cashback",   desc: "₹300 Flight Booking Credit", pts: 30000  },
        ];
        const catColors = {
          "SHOPPING":       { text: "var(--accent2)", bg: "rgba(167,139,250,0.10)", border: "rgba(167,139,250,0.2)" },
          "FOOD & BEVERAGE":{ text: "var(--green)",   bg: "rgba(52,211,153,0.10)",  border: "rgba(52,211,153,0.2)"  },
          "TRAVEL":         { text: "var(--accent3)", bg: "rgba(56,189,248,0.10)",  border: "rgba(56,189,248,0.2)"  },
          "ENTERTAINMENT":  { text: "var(--red)",     bg: "rgba(248,113,113,0.10)", border: "rgba(248,113,113,0.2)" },
          "UTILITY":        { text: "var(--gold)",    bg: "rgba(245,200,66,0.10)",  border: "rgba(245,200,66,0.2)"  },
        };
        const userPts = rewards.totalPoints;
        return (
          <div>
            {/* Header */}
            <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: "14px" }}>
              <div>
                <h3 style={{ fontSize: "16px", fontWeight: 800 }}>Redeem Your Points</h3>
                <p style={{ color: "var(--text3)", fontSize: "12px", marginTop: "2px" }}>Use your points to unlock exclusive rewards</p>
              </div>
              <div style={{ alignItems: "center", background: "rgba(108,99,255,0.1)", border: "1px solid rgba(108,99,255,0.2)", borderRadius: "100px", display: "flex", gap: "5px", padding: "5px 12px" }}>
                <Ico n="star" s={12} c="var(--gold)" />
                <span style={{ color: "var(--text)", fontSize: "12px", fontWeight: 700 }}>{userPts.toLocaleString()} pts available</span>
              </div>
            </div>

            {/* Offer grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "12px" }}>
              {OFFERS.map((offer, i) => {
                const canRedeem = userPts >= offer.pts;
                const cc = catColors[offer.cat] || catColors["UTILITY"];
                return (
                  <div key={i} className="card" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "10px", transition: "border-color 0.2s, transform 0.2s", cursor: canRedeem ? "pointer" : "default" }}
                    onMouseEnter={e => { if (canRedeem) { e.currentTarget.style.borderColor = "rgba(108,99,255,0.35)"; e.currentTarget.style.transform = "translateY(-2px)"; } }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = ""; e.currentTarget.style.transform = ""; }}
                  >
                    {/* Top row: emoji + category badge */}
                    <div style={{ alignItems: "center", display: "flex", gap: "10px" }}>
                      <div style={{ alignItems: "center", background: "rgba(255,255,255,0.05)", borderRadius: "10px", display: "flex", fontSize: "24px", height: "44px", justifyContent: "center", width: "44px", flexShrink: 0 }}>
                        {offer.emoji}
                      </div>
                      <span style={{ background: cc.bg, border: `1px solid ${cc.border}`, borderRadius: "100px", color: cc.text, fontSize: "9px", fontWeight: 700, letterSpacing: "0.7px", padding: "2px 8px", textTransform: "uppercase" }}>
                        {offer.cat}
                      </span>
                    </div>

                    {/* Name + desc */}
                    <div>
                      <p style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>{offer.name}</p>
                      <p style={{ color: "var(--text3)", fontSize: "12px", marginTop: "2px" }}>{offer.desc}</p>
                    </div>

                    {/* Points + CTA */}
                    <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginTop: "auto" }}>
                      <span style={{ color: "var(--accent2)", fontSize: "14px", fontWeight: 800 }}>{offer.pts} pts</span>
                      <button
                        disabled={!canRedeem}
                        onClick={() => canRedeem && alert(`🎉 Redeemed: ${offer.name}! ${offer.pts} points deducted.`)}
                        style={{
                          background: canRedeem ? "linear-gradient(135deg, var(--accent), #5b52e8)" : "rgba(255,255,255,0.05)",
                          border: canRedeem ? "none" : "1px solid var(--border)",
                          borderRadius: "8px", color: canRedeem ? "#fff" : "var(--text3)",
                          cursor: canRedeem ? "pointer" : "not-allowed",
                          fontSize: "11px", fontWeight: 700, padding: "6px 12px",
                          transition: "opacity 0.15s",
                          opacity: canRedeem ? 1 : 0.6,
                        }}
                        onMouseEnter={e => { if (canRedeem) e.currentTarget.style.opacity = "0.85"; }}
                        onMouseLeave={e => { if (canRedeem) e.currentTarget.style.opacity = "1"; }}
                      >
                        {canRedeem ? "Redeem" : "Need More Points"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function NotifsPage({ notifications, onMarkRead }) {
  const cfg = { SUCCESS: { i: "chk", c: "var(--green)", bg: "rgba(52,211,153,0.1)" }, REWARD: { i: "star", c: "var(--gold)", bg: "rgba(245,200,66,0.1)" }, SECURITY: { i: "shield", c: "var(--red)", bg: "rgba(248,113,113,0.1)" }, INFO: { i: "bell", c: "var(--accent)", bg: "rgba(108,99,255,0.1)" } };
  return (
    <div className="ai nw" style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "580px" }}>
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
        <div><h1 style={{ fontSize: "20px", fontWeight: 800 }}>Notifications</h1><p style={{ color: "var(--text3)", fontSize: "12px", marginTop: "2px" }}>Stay updated on your account</p></div>
        {notifications.some(n => !n.read) && <button className="btn-g" onClick={() => notifications.filter(n => !n.read).forEach(n => onMarkRead(n.id))} style={{ fontSize: "12px", padding: "6px 12px" }}>Mark all read</button>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
        {notifications.map(n => {
          const c = cfg[n.type] || cfg.INFO;
          return (
            <div key={n.id} onClick={() => onMarkRead(n.id)} style={{ alignItems: "flex-start", background: n.read ? "var(--surface)" : "rgba(108,99,255,0.04)", border: `1px solid ${n.read ? "var(--border)" : "rgba(108,99,255,0.15)"}`, borderRadius: "12px", cursor: "pointer", display: "flex", gap: "11px", padding: "12px 14px" }}>
              <div style={{ alignItems: "center", background: c.bg, borderRadius: "9px", color: c.c, display: "flex", flexShrink: 0, height: "34px", justifyContent: "center", width: "34px" }}><Ico n={c.i} s={15} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ alignItems: "center", display: "flex", gap: "6px", marginBottom: "2px" }}>
                  <p style={{ fontSize: "13px", fontWeight: n.read ? 400 : 600 }}>{n.title}</p>
                  {!n.read && <span style={{ background: "var(--accent)", borderRadius: "50%", height: "6px", width: "6px", flexShrink: 0 }} />}
                </div>
                <p style={{ color: "var(--text2)", fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.message}</p>
                <p style={{ color: "var(--text3)", fontSize: "10px", marginTop: "2px" }}>{fmt.dt(n.createdAt)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProfilePage({ onLogout }) {
  const toast = useToast();
  const { token } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getUser(token)
      .then(u => setProfile(u))
      .catch(() => toast("Failed to load profile", "error"))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return (
    <div style={{ alignItems: "center", display: "flex", justifyContent: "center", height: "60vh" }}>
      <Spin />
    </div>
  );

  const displayName = profile?.name || "User";
  const displayEmail = profile?.email || "";
  const displayId = profile?.id != null ? String(profile.id) : "";

  return (
    <div className="ai pw" style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "520px" }}>
      <div><h1 style={{ fontSize: "20px", fontWeight: 800 }}>Profile</h1><p style={{ color: "var(--text3)", fontSize: "12px", marginTop: "2px" }}>Manage your account settings</p></div>
      <div className="card" style={{ alignItems: "center", display: "flex", gap: "14px", flexWrap: "wrap" }}>
        <div style={{ alignItems: "center", background: "linear-gradient(135deg,var(--accent),var(--accent3))", borderRadius: "50%", color: "#fff", display: "flex", flexShrink: 0, fontWeight: 900, fontSize: "22px", height: "56px", justifyContent: "center", width: "56px" }}>{displayName[0]?.toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</h2>
          <p style={{ color: "var(--text3)", fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayEmail}</p>
        </div>
      </div>
      <div className="card">
        <h3 style={{ fontSize: "13px", fontWeight: 700, marginBottom: "14px" }}>Personal Information</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
          {[
            ["Full Name", displayName],
            ["Email Address", displayEmail],
            ["User ID", displayId],
          ].map(([label, val]) => (
            <div key={label}>
              <label className="lbl">{label}</label>
              <input value={val} readOnly style={{ opacity: 0.6 }} />
            </div>
          ))}
        </div>
      </div>
      <div className="card" style={{ border: "1px solid rgba(248,113,113,0.15)" }}>
        <h3 style={{ color: "var(--red)", fontSize: "13px", fontWeight: 700, marginBottom: "10px" }}>Danger Zone</h3>
        <button className="btn-d" onClick={onLogout} style={{ alignItems: "center", display: "flex", gap: "7px" }}><Ico n="logout" s={13} /> Sign Out</button>
      </div>
    </div>
  );
}

function Dashboard({ token, user, onLogout }) {
  const [page, setPage] = useState("dashboard");
  const navigateTo = useCallback((p) => {
    setPage(p);
    if (p === "notifications") {
      // Mark all unread notifications as read when tab is opened
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }
  }, []);
  const [wallet, setWallet] = useState({ balance: 0, availableBalance: 0, currency: "INR", walletId: "" });
  const [transactions, setTransactions] = useState([]);
  const [rewards, setRewards] = useState({ totalPoints: 0, tier: "BRONZE", cashbackEarned: 0 });
  const [rewardHistory, setRewardHistory] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [earnedReward, setEarnedReward] = useState(null);
  const [walletModal, setWalletModal] = useState(null); // null | "add" | "withdraw"
  const [walletAmt, setWalletAmt] = useState("");
  const [walletLoading, setWalletLoading] = useState(false);
  const unread = notifications.filter(n => !n.read).length;

  const refresh = useCallback(async () => {
    try {
      const [w, t, r, n] = await Promise.all([
        api.getWallet(token).catch(() => null),
        api.getTransactions(token).catch(() => null),
        api.getRewards(token).catch(() => null),
        api.getNotifications(token).catch(() => null),
      ]);
      // Normalize wallet: backend returns { balance, availableBalance } as Long (raw rupees)
      if (w) setWallet({
        balance: w.balance || 0,
        availableBalance: w.availableBalance || 0,
        currency: w.currency || "INR",
        walletId: w.id ? String(w.id) : ("NP-" + (w.userId || "")),
      });
      // Normalize transactions: resolve counterpart user IDs → real names
      if (Array.isArray(t)) {
        // Collect all unique counterpart IDs we need to look up
        const counterpartIds = [...new Set(t.map(tx =>
          tx.senderId === user?.id ? tx.receiverId : tx.senderId
        ).filter(Boolean))];
        // Fetch all names in parallel, build id→firstName map
        const nameMap = {};
        await Promise.all(counterpartIds.map(async (uid) => {
          const u = await api.getUserById(uid, token);
          if (u?.name) nameMap[uid] = u.name.split(" ")[0]; // first name only
        }));
        setTransactions(t.map(tx => {
          const isDebit = tx.senderId === user?.id;
          const counterpartId = isDebit ? tx.receiverId : tx.senderId;
          const name = nameMap[counterpartId] || null;
          return {
            id: tx.id,
            type: isDebit ? "DEBIT" : "CREDIT",
            amount: tx.amount || 0,
            description: isDebit
              ? `Transfer to ${name || `User #${tx.receiverId}`}`
              : `Received from ${name || `User #${tx.senderId}`}`,
            timestamp: tx.timestamp || new Date().toISOString(),
            status: tx.status || "SUCCESS",
          };
        }));
      }
      // Normalize rewards: backend returns array of { id, userId, points, sentAt, transactionId }
      // Must produce { totalPoints, tier, cashbackEarned } — NOT { points, history }
      if (Array.isArray(r)) {
        const totalPoints = r.reduce((s, x) => s + (x.points || 0), 0);
        const tier = totalPoints >= 10000 ? "DIAMOND" : totalPoints >= 5000 ? "PLATINUM" : totalPoints >= 1000 ? "GOLD" : totalPoints >= 500 ? "SILVER" : "BRONZE";
        setRewards({ totalPoints, tier, cashbackEarned: Math.round(totalPoints * 0.10) });
        setRewardHistory(r.map(x => ({
          id: x.id,
          points: x.points || 0,
          reason: `Transaction #${x.transactionId || x.id}`,
          earnedAt: x.sentAt || new Date().toISOString(),
        })));
      }
      // Normalize notifications: backend returns array of { id, userId, message, sentAt }
      if (Array.isArray(n)) setNotifications(n.map(x => ({
        id: x.id,
        title: "Notification",
        message: x.message,
        createdAt: x.sentAt || new Date().toISOString(),
        read: false,
      })));
    } catch { }
    finally { setLoading(false); }
  }, [token, user?.id]);

  // Fetch real data immediately on mount — no mock data shown at startup
  useEffect(() => { refresh(); }, [refresh]);

  const markRead = (id) => { setNotifications(p => p.map(n => n.id === id ? { ...n, read: true } : n)); api.markRead(id, token).catch(() => null); };

  const toast = useToast();
  const handleDeposit = async () => {
    if (!walletAmt || +walletAmt <= 0) { toast("Enter a valid amount", "error"); return; }
    setWalletLoading(true);
    await api.addFunds(+walletAmt, token).catch(() => null);
    toast(`Rs.${(+walletAmt).toLocaleString()} added!`, "success");
    setWalletModal(null); setWalletAmt(""); refresh(); setWalletLoading(false);
  };
  const handleWithdraw = async () => {
    if (!walletAmt || +walletAmt <= 0) { toast("Enter a valid amount", "error"); return; }
    if (+walletAmt > wallet.balance) { toast("Insufficient balance", "error"); return; }
    setWalletLoading(true);
    await api.withdrawFunds(+walletAmt, token).catch(() => null);
    toast(`Rs.${(+walletAmt).toLocaleString()} withdrawn!`, "success");
    setWalletModal(null); setWalletAmt(""); refresh(); setWalletLoading(false);
  };

  const pages = {
    dashboard: <DashPage wallet={wallet} transactions={transactions} rewards={rewards} setPage={navigateTo} />,
    wallet: <WalletPage wallet={wallet} transactions={transactions} onRefresh={refresh} onAddFunds={() => { setWalletAmt(""); setWalletModal("add"); }} onWithdraw={() => { setWalletAmt(""); setWalletModal("withdraw"); }} />,
    send: <SendPage wallet={wallet} onRefresh={refresh} onReward={setEarnedReward} />,
    rewards: <RewardsPage rewards={rewards} rewardHistory={rewardHistory} />,
    notifications: <NotifsPage notifications={notifications} onMarkRead={markRead} />,
    profile: <ProfilePage onLogout={onLogout} />,
  };

  return (
    <AuthContext.Provider value={{ token, user }}>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar page={page} setPage={navigateTo} user={user} onLogout={onLogout} nc={unread} />
        <main className="dmain" style={{ flex: 1, overflow: "auto", padding: "26px 28px" }}>
          {loading
            ? <div style={{ alignItems: "center", display: "flex", justifyContent: "center", height: "60vh" }}><Spin /></div>
            : (pages[page] || pages.dashboard)
          }
        </main>
        <BotNav page={page} setPage={navigateTo} nc={unread} />
      </div>
      {earnedReward && <RewardEarnedCard reward={earnedReward} onClose={() => { setEarnedReward(null); refresh(); }} />}
      <Modal open={walletModal === "add"} onClose={() => setWalletModal(null)} title="Add Funds">
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div><label className="lbl">Amount (INR)</label><input type="number" placeholder="Enter amount" value={walletAmt} onChange={e => setWalletAmt(e.target.value)} /></div>
          <div style={{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
            {[500, 1000, 2000, 5000].map(q => <button key={q} onClick={() => setWalletAmt(String(q))} style={{ background: walletAmt == q ? "rgba(108,99,255,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${walletAmt == q ? "rgba(108,99,255,0.3)" : "var(--border)"}`, borderRadius: "8px", color: walletAmt == q ? "var(--accent)" : "var(--text2)", fontSize: "13px", padding: "6px 12px" }}>Rs.{q.toLocaleString()}</button>)}
          </div>
          <button className="btn-p" onClick={handleDeposit} disabled={walletLoading} style={{ width: "100%", padding: "13px" }}>{walletLoading ? <Spin /> : `Add ${walletAmt ? fmt.cur(+walletAmt) : "Funds"}`}</button>
        </div>
      </Modal>
      <Modal open={walletModal === "withdraw"} onClose={() => setWalletModal(null)} title="Withdraw Funds">
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ background: "rgba(245,200,66,0.06)", border: "1px solid rgba(245,200,66,0.15)", borderRadius: "10px", padding: "10px 13px" }}><p style={{ color: "var(--gold)", fontSize: "13px" }}>Available: {fmt.cur(wallet.balance)}</p></div>
          <div><label className="lbl">Amount (INR)</label><input type="number" placeholder="Enter amount" value={walletAmt} onChange={e => setWalletAmt(e.target.value)} /></div>
          <button className="btn-p" onClick={handleWithdraw} disabled={walletLoading} style={{ width: "100%", padding: "13px" }}>{walletLoading ? <Spin /> : `Withdraw ${walletAmt ? fmt.cur(+walletAmt) : ""}`}</button>
        </div>
      </Modal>
    </AuthContext.Provider>
  );
}

export default function App() {
  const [view, setView] = useState("landing");
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const login = (tok, usr) => { setToken(tok); setUser(usr); setView("dashboard"); };
  const logout = () => { setToken(null); setUser(null); setView("landing"); };
  return (
    <ToastProvider>
      <style>{STYLES}</style>
      {view === "landing" && <Landing onSignIn={() => setView("auth")} />}
      {view === "auth" && <Auth onLogin={login} onBack={() => setView("landing")} />}
      {view === "dashboard" && token && user && <Dashboard token={token} user={user} onLogout={logout} />}
    </ToastProvider>
  );
}