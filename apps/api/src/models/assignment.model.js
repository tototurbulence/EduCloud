import mongoose from 'mongoose';

const assignmentSchema = new mongoose.Schema({
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 160 },
  instructions: { type: String, required: true, trim: true, minlength: 1, maxlength: 12000 },
  deadline: { type: Date, required: true },
  maxScore: { type: Number, required: true, min: 0, max: 1000, default: 100 },
}, {
  timestamps: true,
  strict: 'throw',
  versionKey: false,
});

assignmentSchema.index({ courseId: 1, deadline: 1, _id: 1 });
assignmentSchema.index({ createdBy: 1, createdAt: -1, _id: -1 });

export function createAssignmentModel(connection = mongoose) {
  return connection.models.Assignment ?? connection.model('Assignment', assignmentSchema);
}
