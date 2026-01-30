import mongoose from 'mongoose';

const statusSchema = new mongoose.Schema({
  evaluacion_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Evaluation',
    required: true
  },
  estudiante_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  completada: {
    type: Boolean,
    default: false
  },
  fecha_completada: {
    type: Date
  },
  progreso: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  }
}, {
  timestamps: true
});

export default mongoose.model('Status', statusSchema);
