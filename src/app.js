import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import academicsRoutes from './modules/academics/academics.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import syncRoutes from './modules/sync/sync.routes.js';
import evaluationsRoutes from './modules/evaluations/evaluations.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import surveysRoutes from './modules/surveys/surveys.routes.js';

dotenv.config();

const app = express();

// Orígenes permitidos (CORS): desarrollo + producción
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://evaluaciones-uao-front.vercel.app',
  'https://evaluaciones-uao-front.vercel.app/',
  process.env.FRONTEND_URL
].filter(Boolean);

// Log de cada request (para CloudWatch / debugging)
app.use((req, res, next) => {
  const start = Date.now();
  const { method, path, url } = req;
  const origin = req.headers.origin || '-';
  console.log(`[REQ] ${method} ${path} | origin: ${origin}`);
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[RES] ${method} ${path} | ${res.statusCode} | ${duration}ms`);
  });
  next();
});

// Responder OPTIONS (preflight) lo antes posible para evitar 504 en ALB/proxy
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    const allowed = origin && allowedOrigins.includes(origin);
    console.log(`[CORS] OPTIONS ${req.path} | origin: ${origin || '-'} | allowed: ${allowed}`);
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.sendStatus(204);
  }
  next();
});

app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sin origin (ej. Postman, servidor a servidor)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.warn(`[CORS] Origen no permitido: ${origin}`);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Ruta raíz
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'API de Evaluaciones Rosario',
    version: '1.0.0',
    endpoints: '/api'
  });
});

// Health check para ALB/ECS (GET /ping)
app.get('/ping', (req, res) => {
  res.status(200).send('OK');
});

app.use('/api/auth', authRoutes);
app.use('/api/academics', academicsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/evaluations', evaluationsRoutes);
app.use('/api/surveys', surveysRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Servidor funcionando' });
});

// Endpoint para verificar conexiones
app.get('/api/health/connections', async (req, res) => {
  const pool = (await import('./config/mysql.js')).default;
  const mongoose = (await import('mongoose')).default;
  
  const status = {
    server: 'OK',
    mysql: {
      connected: false,
      error: null
    },
    mongodb: {
      connected: false,
      error: null
    }
  };
  
  // Verificar MySQL
  try {
    const [rows] = await pool.query('SELECT 1 as test');
    status.mysql.connected = true;
    status.mysql.database = process.env.MYSQL_DB;
    status.mysql.host = process.env.MYSQL_HOST;
  } catch (error) {
    status.mysql.connected = false;
    status.mysql.error = error.message;
  }
  
  // Verificar MongoDB
  try {
    status.mongodb.connected = mongoose.connection.readyState === 1;
    if (status.mongodb.connected) {
      status.mongodb.database = mongoose.connection.db.databaseName;
    } else {
      status.mongodb.error = 'MongoDB no está conectado';
    }
  } catch (error) {
    status.mongodb.connected = false;
    status.mongodb.error = error.message;
  }
  
  res.json(status);
});

// Manejador de errores (log y respuesta genérica)
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  console.error('[ERROR] Stack:', err.stack);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Ruta no encontrada
app.use((req, res) => {
  console.warn(`[404] ${req.method} ${req.path}`);
  res.status(404).json({ error: 'Ruta no encontrada' });
});

export default app;
