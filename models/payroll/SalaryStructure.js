const mongoose = require('mongoose');

const salaryStructureSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Earnings Components
    basic: { type: Number, required: true },             // Basic Salary
    da: { type: Number, default: 0 },                    // Dearness Allowance
    hra: { type: Number, default: 0 },                   // House Rent Allowance
    specialAllowance: { type: Number, default: 0 },      // Special Allowance
    otherAllowances: { type: Number, default: 0 },       // Other Allowances

    // Computed
    grossSalary: { type: Number, required: true },       // Sum of all earnings

    // CTC (Gross + Employer PF + Employer ESI + Bonus etc.)
    annualCTC: { type: Number, default: 0 },
    monthlyCTC: { type: Number, default: 0 },

    // PF Configuration
    pfOptedOut: { type: Boolean, default: false },       // Only valid if Basic+DA > ₹15,000
    pfAccountNumber: String,
    uanNumber: String,

    // Tax Regime
    taxRegime: { type: String, enum: ['OLD', 'NEW'], default: 'NEW' },

    // Versioning
    effectiveFrom: { type: Date, required: true, default: Date.now },
    effectiveTo: { type: Date },
    isActive: { type: Boolean, default: true },
    version: { type: Number, default: 1 },

    // Metadata
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    remarks: String
}, { timestamps: true });

salaryStructureSchema.index({ user: 1, isActive: 1 });
salaryStructureSchema.index({ user: 1, effectiveFrom: -1 });

module.exports = mongoose.model('SalaryStructure', salaryStructureSchema);
