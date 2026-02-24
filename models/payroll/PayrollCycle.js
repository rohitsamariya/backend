const mongoose = require('mongoose');

const payrollCycleSchema = new mongoose.Schema({
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },

    status: {
        type: String,
        enum: ['DRAFT', 'PROCESSING', 'PROCESSED', 'FAILED', 'FINALIZED', 'PROCESSED + SENT'],
        default: 'DRAFT'
    },

    // Processing Stats
    totalEmployees: { type: Number, default: 0 },
    processed: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },

    // Financial Summary
    totalGross: { type: Number, default: 0 },
    totalDeductions: { type: Number, default: 0 },
    totalNetPay: { type: Number, default: 0 },
    totalEmployerPF: { type: Number, default: 0 },
    totalEmployerESI: { type: Number, default: 0 },
    totalCostToCompany: { type: Number, default: 0 },

    // Audit
    initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lockedAt: Date,
    processingStartedAt: Date,
    processingCompletedAt: Date,

    logs: [{ message: String, timestamp: { type: Date, default: Date.now }, level: { type: String, default: 'info' } }],
    failureDetails: [{ employeeId: mongoose.Schema.Types.ObjectId, error: String, timestamp: { type: Date, default: Date.now } }]
}, { timestamps: true });

payrollCycleSchema.index({ branch: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('PayrollCycle', payrollCycleSchema);
