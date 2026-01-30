import mongoose from 'mongoose';

const tokenSchema = new mongoose.Schema({
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
  token: {
    type: String,
    required: true,
    unique: true
  },
  usado: {
    type: Boolean,
    default: false
  },
  fecha_uso: {
    type: Date
  },
  expira_en: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

export default mongoose.model('Token', tokenSchema);
