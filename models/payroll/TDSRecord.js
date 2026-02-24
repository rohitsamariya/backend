const mongoose = require('mongoose');

const tdsRecordSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    payrollCycle: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollCycle' },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    month: { type: Number, required: true },
    year: { type: Number, required: true },
    financialYear: { type: String, required: true },

    // Regime
    regime: { type: String, enum: ['OLD', 'NEW'], required: true },

    // Annual Projections
    annualGross: { type: Number, required: true },
    standardDeduction: { type: Number, default: 0 },
    section80C: { type: Number, default: 0 },
    section80D: { type: Number, default: 0 },
    hraExemption: { type: Number, default: 0 },
    otherExemptions: { type: Number, default: 0 },
    totalExemptions: { type: Number, default: 0 },

    taxableIncome: { type: Number, required: true },

    // Tax Calculation
    annualTaxBeforeCess: { type: Number, default: 0 },
    surcharge: { type: Number, default: 0 },
    cess: { type: Number, default: 0 },
    totalAnnualTax: { type: Number, default: 0 },

    // Monthly
    tdsPaidYTD: { type: Number, default: 0 },              // TDS already paid this FY
    remainingMonths: { type: Number, default: 12 },
    monthlyTDS: { type: Number, required: true },           // This month's TDS

    // 24Q / Form 16 Fields
    panNumber: String,
    assessmentYear: String
}, { timestamps: true });

tdsRecordSchema.index({ user: 1, month: 1, year: 1 }, { unique: true });
tdsRecordSchema.index({ financialYear: 1, branch: 1 });

module.exports = mongoose.model('TDSRecord', tdsRecordSchema);
