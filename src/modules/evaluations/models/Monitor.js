import mongoose from 'mongoose';

const monitorSchema = new mongoose.Schema({
  user_id_mysql: {
    type: Number,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  last_name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  identification: {
    type: String
  }
}, {
  timestamps: true
});

export default mongoose.model('Monitor', monitorSchema);
