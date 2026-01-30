import mongoose from 'mongoose';

const evaluationAccessTokenSchema = new mongoose.Schema({
  evaluation_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Evaluation',
    required: true
  },
  legalization_id: {
    type: Number,
    required: true
  },
  actor_type: {
    type: String,
    enum: ['student', 'boss', 'monitor', 'teacher', 'coordinator'],
    required: true
  },
  email: {
    type: String,
    required: true
  },
  med_enc_id: {
    type: Number,
    required: true
  },
  token: {
    type: String,
    required: true,
    unique: true
  },
  link: {
    type: String,
    required: true
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
  },
  monitor_type: {
    type: String,
    enum: ['user_tutor', 'user_tutor_2'],
    default: null
  }
}, {
  timestamps: true
});

// Índice compuesto para búsquedas rápidas
evaluationAccessTokenSchema.index({ evaluation_id: 1, legalization_id: 1, actor_type: 1 });
evaluationAccessTokenSchema.index({ token: 1 });

export default mongoose.model('EvaluationAccessToken', evaluationAccessTokenSchema);
