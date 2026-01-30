import app from './app.js';
import connectMongo from './config/mongo.js';
import { testMySQLConnection } from './config/mysql.js';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 3000;

// Verificar conexiones antes de iniciar el servidor
const initializeServer = async () => {
  console.log('🔌 Verificando conexiones...\n');
  
  // Verificar MySQL
  const mysqlConnected = await testMySQLConnection();
  console.log('');
  
  // Conectar MongoDB (opcional)
  await connectMongo();
  console.log('');
  
  if (!mysqlConnected) {
    console.error('❌ No se pudo conectar a MySQL. El servidor puede no funcionar correctamente.');
    console.error('   Revisa las credenciales en el archivo .env\n');
  }
  
  // Iniciar servidor
  app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📡 Endpoints disponibles en http://localhost:${PORT}/api\n`);
  });
};

initializeServer();
