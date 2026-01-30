import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  evaluacion_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Evaluation',
    required: true
  },
  texto: {
    type: String,
    required: true
  },
  tipo: {
    type: String,
    enum: ['texto', 'opcion_multiple', 'escala'],
    required: true
  },
  opciones: [{
    texto: String,
    valor: String
  }],
  orden: {
    type: Number,
    required: true
  },
  requerida: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

export default mongoose.model('Question', questionSchema);
