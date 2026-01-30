import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from '../src/modules/auth/models/User.js';

dotenv.config();

const createTestUsers = async () => {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado a MongoDB\n');

    // Usuarios de prueba a crear
    const testUsers = [
      {
        username: 'admin',
        email: 'admin@rosario.edu.co',
        password: 'admin123',
        name: 'Administrador',
        last_name: 'Sistema',
        role: 'admin',
        status: 'ACTIVE'
      },
      {
        username: 'coordinador',
        email: 'coordinador@rosario.edu.co',
        password: 'coord123',
        name: 'Coordinador',
        last_name: 'Prácticas',
        role: 'coordinador',
        status: 'ACTIVE'
      },
      {
        username: 'monitor',
        email: 'monitor@rosario.edu.co',
        password: 'monitor123',
        name: 'Monitor',
        last_name: 'Prácticas',
        role: 'monitor',
        status: 'ACTIVE'
      },
      {
        username: 'usuario',
        email: 'usuario@rosario.edu.co',
        password: 'user123',
        name: 'Usuario',
        last_name: 'Prueba',
        role: 'user',
        status: 'ACTIVE'
      }
    ];

    console.log('🔨 Creando usuarios de prueba...\n');

    for (const userData of testUsers) {
      try {
        // Verificar si el usuario ya existe
        const existing = await User.findOne({
          $or: [
            { username: userData.username.toLowerCase() },
            { email: userData.email.toLowerCase() }
          ]
        });

        if (existing) {
          console.log(`⚠️  Usuario "${userData.username}" ya existe, omitiendo...`);
          continue;
        }

        // Crear usuario (el hash se hace automáticamente)
        const user = new User(userData);
        await user.save();

        console.log(`✅ Usuario creado: ${userData.username} (${userData.email})`);
        console.log(`   Contraseña: ${userData.password}`);
        console.log(`   Rol: ${userData.role}\n`);
      } catch (error) {
        if (error.code === 11000) {
          console.log(`⚠️  Usuario "${userData.username}" ya existe (duplicado), omitiendo...\n`);
        } else {
          console.error(`❌ Error al crear usuario "${userData.username}":`, error.message);
        }
      }
    }

    console.log('\n✅ Proceso completado!');
    console.log('\n📋 Resumen de usuarios creados:');
    console.log('   - admin / admin123 (admin)');
    console.log('   - coordinador / coord123 (coordinador)');
    console.log('   - monitor / monitor123 (monitor)');
    console.log('   - usuario / user123 (user)');
    console.log('\n💡 Puedes iniciar sesión con cualquiera de estos usuarios.\n');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

createTestUsers();
