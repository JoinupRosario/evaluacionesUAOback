import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema({
  evaluacion_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Evaluation',
    required: true
  },
  pregunta_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true
  },
  estudiante_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  respuesta: {
    type: String,
    required: true
  },
  fecha_respuesta: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

export default mongoose.model('Answer', answerSchema);
