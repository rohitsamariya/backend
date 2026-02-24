const mongoose = require('mongoose');

const payrollSummarySchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    payrollCycle: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollCycle' },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },

    // ── Earnings ──
    basic: { type: Number, default: 0 },
    da: { type: Number, default: 0 },
    hra: { type: Number, default: 0 },
    specialAllowance: { type: Number, default: 0 },
    otherAllowances: { type: Number, default: 0 },
    arrears: { type: Number, default: 0 },             // Salary revision arrears
    grossSalary: { type: Number, required: true },

    // ── Attendance ──
    totalWorkingDays: { type: Number, default: 30 },
    presentDays: { type: Number, default: 0 },
    halfDays: { type: Number, default: 0 },
    absentDays: { type: Number, default: 0 },
    lopDays: { type: Number, default: 0 },
    paidDays: { type: Number, default: 0 },
    availableLeaves: { type: Number, default: 0 },
    leavesUsedThisMonth: { type: Number, default: 0 },

    // ── Pro-Rating ──
    joiningDate: Date,
    exitDate: Date,
    isMidMonthJoin: { type: Boolean, default: false },
    isMidMonthExit: { type: Boolean, default: false },
    proRateFactor: { type: Number, default: 1 },     // 1 = full month

    // ── Deductions ──
    employeePF: { type: Number, default: 0 },
    employeeESI: { type: Number, default: 0 },
    professionalTax: { type: Number, default: 0 },
    tds: { type: Number, default: 0 },
    lopDeduction: { type: Number, default: 0 },
    otherDeductions: { type: Number, default: 0 },
    totalDeductions: { type: Number, required: true },

    // ── Net Pay ──
    netSalary: { type: Number, required: true },

    // ── Employer Costs (not deducted from employee) ──
    employerPF: { type: Number, default: 0 },
    employerESI: { type: Number, default: 0 },
    employerPFAdmin: { type: Number, default: 0 },
    costToCompany: { type: Number, default: 0 },      // Gross + Employer PF + Employer ESI

    // ── Statutory Flags ──
    pfApplicable: { type: Boolean, default: false },
    esiApplicable: { type: Boolean, default: false },
    tdsApplicable: { type: Boolean, default: false },
    ptApplicable: { type: Boolean, default: false },
    taxRegime: { type: String, enum: ['OLD', 'NEW'], default: 'NEW' },

    // ── Status ──
    status: {
        type: String,
        enum: ['DRAFT', 'PROCESSED', 'FINALIZED', 'FAILED', 'SUPERSEDED'],
        default: 'DRAFT'
    },
    generatedAt: { type: Date, default: Date.now },
    finalizedAt: Date,
    finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    emailSent: { type: Boolean, default: false },
    emailSentAt: Date,

    // ── Audit ──
    salaryStructureVersion: { type: Number, default: 1 },
    probationStatus: { type: String, enum: ['ON_PROBATION', 'POST_PROBATION'] },
    payrollRunId: { type: String, index: true },
    calculationLog: { type: String }  // JSON string of calculation breakdown
}, { timestamps: true });

payrollSummarySchema.index(
    { user: 1, month: 1, year: 1 },
    { unique: true, partialFilterExpression: { status: { $ne: 'SUPERSEDED' } } }
);
payrollSummarySchema.index({ branch: 1, month: 1, year: 1 });
payrollSummarySchema.index({ payrollCycle: 1 });

module.exports = mongoose.model('PayrollSummary', payrollSummarySchema);
