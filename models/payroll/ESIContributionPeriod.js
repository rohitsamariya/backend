const mongoose = require('mongoose');

/**
 * ESI Contribution Period — ESIC Compliance
 * 
 * ESI follows 6-month contribution periods:
 *   Period 1: April – September
 *   Period 2: October – March
 * 
 * Eligibility is locked at the START of each period.
 * If eligible in April → eligible for entire Apr–Sep,
 * even if salary crosses ₹21,000 mid-period.
 */
const esiContributionPeriodSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Period boundaries
    periodStart: { type: Date, required: true },    // e.g., 2025-04-01 or 2025-10-01
    periodEnd: { type: Date, required: true },      // e.g., 2025-09-30 or 2026-03-31
    periodLabel: { type: String },                  // e.g., "Apr2025-Sep2025"

    // Eligibility lock
    isEligible: { type: Boolean, required: true },
    grossAtEligibility: { type: Number, required: true },  // Gross salary when eligibility was checked
    eligibilityLockedAt: { type: Date, default: Date.now },

    // Config snapshot
    esiCeiling: { type: Number, default: 21000 }
}, { timestamps: true });

esiContributionPeriodSchema.index({ user: 1, periodStart: 1 }, { unique: true });

module.exports = mongoose.model('ESIContributionPeriod', esiContributionPeriodSchema);
