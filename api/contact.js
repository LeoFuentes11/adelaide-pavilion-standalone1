/**
 * api/contact.js — Adelaide Pavilion
 * POST /api/contact
 * Handles enquiry form submissions. Validates, rate-limits, verifies Turnstile,
 * then sends via MailerSend. Identical security model to original.
 *
 * Required env vars:
 *   TURNSTILE_SECRET_KEY  — Cloudflare Turnstile dashboard
 *   MAILERSEND_API_KEY    — app.mailersend.com → API Tokens
 *   ALLOWED_ORIGIN        — your live domain, e.g. https://adelaidepavilion.com.au
 */
'use strict';

/* ── Rate limiting ─────────────────────────────────────────── */
const rateLimitStore = new Map();
const RATE_LIMIT     = 3;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function isRateLimited(ip) {
  const now  = Date.now();
  const hits = (rateLimitStore.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_LIMIT) return true;
  hits.push(now);
  rateLimitStore.set(ip, hits);
  return false;
}

/* ── Sanitization ──────────────────────────────────────────── */
function sanitize(value, maxLen = 500) {
  if (typeof value !== 'string') return '';
  return value.replace(/[<>]/g, '').replace(/[\r\n\t]/g, ' ').trim().slice(0, maxLen);
}
function sanitizeEmail(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^a-zA-Z0-9._%+\-@]/g, '').slice(0, 254);
}

/* ── Validation ────────────────────────────────────────────── */
const VALID_EVENT_TYPES = new Set([
  'wedding','corporate','birthday','anniversary','christening',
  'engagement','gala','valedictory','christmas','conference','other',
]);
const VALID_GUEST_COUNTS = new Set(['10-30','31-60','61-100','101-150','151-200','201-260','260+']);
const VALID_ROOMS = new Set(['parkview','terrace','unsure','',undefined]);

function validateFields(f) {
  const errors = [];
  if (!/^[a-zA-ZÀ-ÖØ-öø-ÿ\-' ]{1,50}$/.test(f.firstName)) errors.push('firstName');
  if (!/^[a-zA-ZÀ-ÖØ-öø-ÿ\-' ]{1,50}$/.test(f.lastName))  errors.push('lastName');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email) || f.email.length > 254) errors.push('email');
  if (f.phone) {
    const stripped = f.phone.replace(/[\s\-()]/g, '');
    if (!/^(\+?61|0)[2-9]\d{8}$/.test(stripped)) errors.push('phone');
  }
  if (!VALID_EVENT_TYPES.has(f.eventType))  errors.push('eventType');
  if (f.eventDate) {
    const d = new Date(f.eventDate);
    if (isNaN(d.getTime()) || d <= new Date()) errors.push('eventDate');
  }
  if (!VALID_GUEST_COUNTS.has(f.guestCount)) errors.push('guestCount');
  if (!VALID_ROOMS.has(f.room))              errors.push('room');
  if (!f.message || f.message.length < 10 || f.message.length > 2000) errors.push('message');
  return errors;
}

/* ── Turnstile ─────────────────────────────────────────────── */
async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Fail closed in production: a missing secret must not silently disable
    // bot protection on a live site. Only skip in non-production (local dev).
    if (process.env.NODE_ENV === 'production') {
      console.error('[contact] TURNSTILE_SECRET_KEY not set in production — rejecting');
      return false;
    }
    console.warn('[contact] TURNSTILE_SECRET_KEY not set — skipping (dev only)');
    return true;
  }
  if (!token) return false;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  });
  return (await res.json()).success === true;
}

/* ── MailerSend ────────────────────────────────────────────── */
async function sendEmail(fields) {
  const apiKey = process.env.MAILERSEND_API_KEY;
  if (!apiKey) { console.warn('[contact] MAILERSEND_API_KEY not set — skipping send'); return; }
  const res = await fetch('https://api.mailersend.com/v1/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      from:     { email: 'noreply@adelaidepavilion.com.au', name: 'Adelaide Pavilion Website' },
      to:       [{ email: 'contact@adelaidepavilion.com.au', name: 'Adelaide Pavilion' }],
      reply_to: { email: fields.email, name: `${fields.firstName} ${fields.lastName}` },
      subject:  `Enquiry: ${fields.eventType} — ${fields.firstName} ${fields.lastName}`,
      text: [
        `Name:       ${fields.firstName} ${fields.lastName}`,
        `Email:      ${fields.email}`,
        `Phone:      ${fields.phone || 'Not provided'}`,
        `Event type: ${fields.eventType}`,
        `Event date: ${fields.eventDate || 'Not specified'}`,
        `Guests:     ${fields.guestCount}`,
        `Newsletter: ${fields.newsletter ? 'Yes — opted in' : 'No'}`,
        '',
        'Message:',
        fields.message,
      ].join('\n'),
    }),
  });
  if (!res.ok) throw new Error(`MailerSend error: ${res.status} ${await res.text()}`);
}

/* ── Handler ───────────────────────────────────────────────── */
module.exports = async function contact(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CSRF: validate origin
  const origin        = req.headers['origin'] || req.headers['referer'] || '';
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '';
  const isLocal       = origin.includes('localhost') || origin.includes('127.0.0.1');
  const isAllowed     = isLocal || (allowedOrigin && origin.startsWith(allowedOrigin));
  if (!isAllowed) {
    console.warn(`[contact] Blocked origin: ${origin}`);
    return res.status(403).json({ error: 'Forbidden' });
  }

  // req.ip is derived from the trusted proxy hop, so it cannot be spoofed via
  // a raw X-Forwarded-For header to bypass rate limiting.
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';

  if (isRateLimited(ip)) {
    return res.status(429).json({
      error: 'Too many submissions. Please wait an hour and try again, or call us on 08 8212 7444.'
    });
  }

  const raw = req.body || {};

  const turnstileOk = await verifyTurnstile(raw['cf-turnstile-response'], ip);
  if (!turnstileOk) {
    return res.status(400).json({ error: 'Security check failed. Please refresh and try again.' });
  }

  const fields = {
    firstName:  sanitize(raw.firstName,  50),
    lastName:   sanitize(raw.lastName,   50),
    email:      sanitizeEmail(raw.email),
    phone:      sanitize(raw.phone,      20),
    eventType:  sanitize(raw.eventType,  30),
    eventDate:  sanitize(raw.eventDate,  10),
    guestCount: sanitize(raw.guestCount, 10),
    room:       sanitize(raw.room,       20),
    message:    sanitize(raw.message,  2000),
    newsletter: raw.newsletter === true || raw.newsletter === 'true',
  };

  const errors = validateFields(fields);
  if (errors.length > 0) {
    return res.status(422).json({ error: 'Please check the highlighted fields.', fields: errors });
  }

  try {
    await sendEmail(fields);
  } catch (err) {
    console.error('[contact] Failed to send email:', err.message);
    return res.status(500).json({ error: 'Unable to send your enquiry. Please call us on 08 8212 7444.' });
  }

  console.log(JSON.stringify({
    event: 'form_submission', timestamp: new Date().toISOString(),
    ip, email: fields.email, eventType: fields.eventType, guests: fields.guestCount,
  }));

  return res.status(200).json({ success: true });
};
