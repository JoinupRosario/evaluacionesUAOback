import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const connectMongo = async () => { 
  try {
    if (!process.env.MONGO_URI) {
      console.log('⚠️  MONGO_URI no configurado en .env');
      console.log('💡 MongoDB será opcional. Configura MONGO_URI si necesitas MongoDB.');
      return;
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB conectado correctamente');
    console.log(`   URI: ${process.env.MONGO_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`); // Ocultar credenciales
  } catch (error) {
    console.error('⚠️  Error al conectar MongoDB:');
    console.error(`   Mensaje: ${error.message}`);
    if (error.reason) {
      console.error(`   Razón: ${error.reason.message || error.reason}`);
    }
    console.log('⚠️  MongoDB no está disponible. Algunas funcionalidades no estarán disponibles.');
    console.log('💡 Para habilitar MongoDB:');
    console.log('   1. Instala MongoDB localmente, o');
    console.log('   2. Configura MONGO_URI en .env apuntando a un servidor MongoDB');
    // No hacemos exit para que el servidor pueda funcionar sin MongoDB
    // Las funciones que usen MongoDB fallarán, pero el servidor seguirá corriendo
  }
};

export default connectMongo;
