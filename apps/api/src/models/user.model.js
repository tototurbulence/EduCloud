import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  displayName: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    maxlength: 254,
    unique: true,
  },
  passwordHash: {
    type: String,
    required: true,
    select: false,
  },
  mustChangePassword: {
    type: Boolean,
    required: true,
    default: false,
  },
  sessionVersion: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },
  mfaEnabled: {
    type: Boolean,
    required: true,
    default: false,
  },
  mfaSecretEncrypted: {
    type: String,
    select: false,
  },
  mfaPendingSecretEncrypted: {
    type: String,
    select: false,
  },
  mfaRecoveryCodeHashes: {
    type: [String],
    select: false,
    default: [],
  },
  mfaLastUsedStep: {
    type: Number,
    select: false,
  },
  role: {
    type: String,
    enum: ['admin', 'instructor', 'learner'],
    required: true,
    default: 'learner',
  },
  status: {
    type: String,
    enum: ['active', 'disabled'],
    required: true,
    default: 'active',
  },
  // Only the first-admin bootstrap command sets this marker. Its unique
  // partial index makes two concurrent bootstrap attempts mutually exclusive.
  isBootstrapAdmin: {
    type: Boolean,
    default: false,
    select: false,
  },
}, {
  timestamps: true,
  strict: 'throw',
  versionKey: false,
});

userSchema.index(
  { isBootstrapAdmin: 1 },
  { unique: true, partialFilterExpression: { isBootstrapAdmin: true } },
);
userSchema.index({ createdAt: -1, _id: -1 });
userSchema.index({ role: 1, status: 1, createdAt: -1, _id: -1 });

export function createUserModel(connection = mongoose) {
  return connection.models.User ?? connection.model('User', userSchema);
}
