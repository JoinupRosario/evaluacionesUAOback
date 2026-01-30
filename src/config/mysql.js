import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DB,
  port: parseInt(process.env.MYSQL_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Función para verificar la conexión
export const testMySQLConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ MySQL conectado correctamente');
    console.log(`   Host: ${process.env.MYSQL_HOST}`);
    console.log(`   Database: ${process.env.MYSQL_DB}`);
    console.log(`   User: ${process.env.MYSQL_USER}`);
    
    // Probar una query simple
    const [rows] = await connection.query('SELECT 1 as test');
    console.log('✅ Query de prueba exitosa');
    
    // Probar query real a una tabla
    try {
      const [periods] = await connection.query('SELECT COUNT(*) as total FROM academic_period LIMIT 1');
      console.log(`✅ Tabla 'academic_period' accesible (${periods[0].total} períodos encontrados)`);
    } catch (tableError) {
      console.warn(`⚠️  No se pudo acceder a la tabla 'academic_period': ${tableError.message}`);
    }
    
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Error al conectar MySQL:');
    console.error(`   Código: ${error.code}`);
    console.error(`   Mensaje: ${error.message}`);
    if (error.sqlMessage) {
      console.error(`   SQL: ${error.sqlMessage}`);
    }
    console.error('\n   Verifica:');
    console.error(`   - Host: ${process.env.MYSQL_HOST || 'NO CONFIGURADO'}`);
    console.error(`   - User: ${process.env.MYSQL_USER || 'NO CONFIGURADO'}`);
    console.error(`   - Database: ${process.env.MYSQL_DB || 'NO CONFIGURADO'}`);
    console.error(`   - Port: ${process.env.MYSQL_PORT || '3306'}`);
    console.error('   - IP autorizada en Google Cloud SQL');
    console.error('   - Credenciales correctas en .env');
    console.error('   - Base de datos existe');
    return false;
  }
};

export default pool;
