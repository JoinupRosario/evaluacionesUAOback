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

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true // Permitir cookies
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

export default app;
