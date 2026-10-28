import mongoose from 'mongoose';

const submissionSchema = new mongoose.Schema({
  assignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Assignment',
    required: true,
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
  },
  learnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  content: { type: String, required: true, trim: true, minlength: 1, maxlength: 20000 },
  submittedAt: { type: Date, required: true, default: Date.now },
  gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  grade: { type: Number, min: 0, max: 1000 },
  feedback: { type: String, maxlength: 6000, default: '' },
  gradedAt: { type: Date },
}, {
  timestamps: true,
  strict: 'throw',
  versionKey: false,
});

submissionSchema.index({ assignmentId: 1, learnerId: 1 }, { unique: true });
submissionSchema.index({ assignmentId: 1, updatedAt: -1, _id: -1 });
submissionSchema.index({ courseId: 1, updatedAt: -1, _id: -1 });
submissionSchema.index({ learnerId: 1, updatedAt: -1, _id: -1 });
submissionSchema.index({ courseId: 1, gradedAt: 1, updatedAt: -1 });
submissionSchema.index({ learnerId: 1, courseId: 1, gradedAt: 1 });

export function createSubmissionModel(connection = mongoose) {
  return connection.models.Submission ?? connection.model('Submission', submissionSchema);
}
