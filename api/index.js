import app from '../src/app.js';
import connectMongo from '../src/config/mongo.js';
import { testMySQLConnection } from '../src/config/mysql.js';

// Inicializar conexiones (solo una vez)
let connectionsInitialized = false;

const initializeConnections = async () => {
  if (connectionsInitialized) return;
  
  try {
    // Conectar MongoDB
    await connectMongo();
    
    // Verificar MySQL (no bloquea si falla)
    await testMySQLConnection();
    
    connectionsInitialized = true;
  } catch (error) {
    console.error('Error inicializando conexiones:', error);
    // No lanzamos el error para que la app pueda seguir funcionando
  }
};

// Inicializar conexiones al cargar el módulo
initializeConnections();

// Handler para Vercel
export default async (req, res) => {
  // Asegurar que las conexiones estén inicializadas
  await initializeConnections();
  
  // Pasar la petición a Express
  return app(req, res);
};
