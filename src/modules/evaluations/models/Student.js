import mongoose from 'mongoose';

const studentSchema = new mongoose.Schema({
  id_mysql: {
    type: Number,
    required: true,
    unique: true
  },
  nombre: {
    type: String,
    required: true
  },
  apellido: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  documento: {
    type: String,
    required: true
  },
  programa_id: {
    type: Number
  },
  periodo_id: {
    type: Number
  }
}, {
  timestamps: true
});

export default mongoose.model('Student', studentSchema);
