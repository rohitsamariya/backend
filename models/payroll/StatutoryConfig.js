const mongoose = require('mongoose');

const statutoryConfigSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },

    // EPF
    epfEmployeeRate: { type: Number, default: 12 },      // 12% of Basic+DA
    epfEmployerRate: { type: Number, default: 12 },      // 12% of Basic+DA
    epsRate: { type: Number, default: 8.33 },             // Out of employer 12%
    epfEmployerNetRate: { type: Number, default: 3.67 },  // 12 - 8.33
    epfWageCeiling: { type: Number, default: 15000 },     // Mandatory if Basic+DA ≤ ₹15,000
    epfEnabled: { type: Boolean, default: true },

    // ESI
    esiEmployeeRate: { type: Number, default: 0.75 },     // 0.75% of Gross
    esiEmployerRate: { type: Number, default: 3.25 },     // 3.25% of Gross
    esiWageCeiling: { type: Number, default: 21000 },     // Eligible if Gross ≤ ₹21,000
    esiEnabled: { type: Boolean, default: true },

    // TDS
    standardDeductionOld: { type: Number, default: 50000 },
    standardDeductionNew: { type: Number, default: 75000 },
    tdsExemptionLimitOld: { type: Number, default: 250000 },
    tdsExemptionLimitNew: { type: Number, default: 300000 },
    defaultRegime: { type: String, enum: ['OLD', 'NEW'], default: 'NEW' },
    surchargeRates: [{
        above: Number,
        upTo: Number,
        rate: Number
    }],
    cessRate: { type: Number, default: 4 }, // 4% Health & Education Cess

    // Bonus
    bonusEligibilityCeiling: { type: Number, default: 21000 }, // Salary ≤ ₹21,000
    bonusMinRate: { type: Number, default: 8.33 },
    bonusMaxRate: { type: Number, default: 20 },
    bonusDefaultRate: { type: Number, default: 8.33 },

    // Gratuity
    gratuityEligibilityYears: { type: Number, default: 5 },
    gratuityFormula: { type: String, default: '(lastSalary * 15 * years) / 26' },

    // Leave & Probation
    annualPaidLeaves: { type: Number, default: 18 },
    probationPeriodMonths: { type: Number, default: 6 },

    financialYear: { type: String, default: '2025-26' },
    effectiveFrom: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('StatutoryConfig', statutoryConfigSchema);
