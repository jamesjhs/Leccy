import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import hpp from 'hpp';
import path from 'path';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth';
import sessionsRoutes from './routes/sessions';
import chargerRoutes from './routes/charger';
import maintenanceRoutes from './routes/maintenance';
import tariffRoutes from './routes/tariff';
import analyticsRoutes from './routes/analytics';
import adminRoutes from './routes/admin';
import vehiclesRoutes from './routes/vehicles';

const app = express();
const PORT = parseInt(process.env.PORT || '2030', 10);
const IS_PROD = process.env.NODE_ENV === 'production';

// ─── Trust proxy (nginx sits in front) ────────────────────────────────────────
// Required so express-rate-limit uses the real client IP (from X-Forwarded-For)
// rather than the nginx proxy IP.
app.set('trust proxy', 1);

// ─── Security headers via Helmet ──────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Tailwind uses inline styles
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    // HSTS: 1 year, include subdomains (Cloudflare also enforces this)
    strictTransportSecurity: {
      maxAge: 31_536_000,
      includeSubDomains: true,
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginEmbedderPolicy: false, // avoid breaking Recharts SVGs
  })
);

// ─── HTTP Parameter Pollution prevention ──────────────────────────────────────
app.use(hpp());

// ─── CORS ─────────────────────────────────────────────────────────────────────
// CSRF note: this API uses Bearer JWT (Authorization header), not cookies.
// Browsers cannot read localStorage or set the Authorization header in cross-site
// requests, so CSRF attacks are structurally impossible for this API.
// We still restrict the CORS origin for defense-in-depth.
const allowedOrigins = IS_PROD
  ? [process.env.DOMAIN ?? ''].filter(Boolean)
  : ['http://localhost:5173'];

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ─── Body parsing — enforce a strict size cap ──────────────────────────────────
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));

// ─── Rate limiters ─────────────────────────────────────────────────────────────
// Global: 300 requests per 15 min per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// ─── API routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', apiLimiter, authRoutes);
app.use('/api/sessions', apiLimiter, sessionsRoutes);
app.use('/api/charger', apiLimiter, chargerRoutes);
app.use('/api/maintenance', apiLimiter, maintenanceRoutes);
app.use('/api/tariff', apiLimiter, tariffRoutes);
app.use('/api/analytics', apiLimiter, analyticsRoutes);
app.use('/api/admin', apiLimiter, adminRoutes);
app.use('/api/vehicles', apiLimiter, vehiclesRoutes);

// ─── Serve frontend in production ─────────────────────────────────────────────
if (IS_PROD) {
  const clientDist = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', apiLimiter, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`[server] Leccy running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
});

export default app;
