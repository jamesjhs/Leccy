import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth';
import sessionsRoutes from './routes/sessions';
import chargerRoutes from './routes/charger';
import maintenanceRoutes from './routes/maintenance';
import tariffRoutes from './routes/tariff';
import analyticsRoutes from './routes/analytics';
import adminRoutes from './routes/admin';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const IS_PROD = process.env.NODE_ENV === 'production';

// CORS
app.use(
  cors({
    origin: IS_PROD ? false : 'http://localhost:5173',
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

// Global API rate limiter: 300 requests per 15 minutes per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});
app.use('/api/', apiLimiter);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/charger', chargerRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/tariff', tariffRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);

// Serve frontend in production
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
