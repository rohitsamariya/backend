/**
 * Professional Tax Service — State Configurable
 * 
 * Maharashtra slabs (FY 2025-26):
 *   Gross ≤ ₹7,500  → ₹0/month
 *   ₹7,501 - ₹10,000 → ₹175/month
 *   ₹10,001+         → ₹200/month (₹300 in Feb)
 *   Max annual = ₹2,500
 * 
 * FIX: Annual cap ₹2,500 enforcement via YTD check.
 * Config-driven via ConfigLoader.
 */

const mongoose = require('mongoose');
const ProfessionalTaxSlab = require('../../models/payroll/ProfessionalTaxSlab');
const ProfessionalTaxRecord = require('../../models/payroll/ProfessionalTaxRecord');

// Defaults used when DB not seeded
const DEFAULT_SLABS = {
    'Maharashtra': {
        maxAnnual: 2500, slabs: [
            { from: 0, to: 7500, monthly: 0, february: 0 },
            { from: 7501, to: 10000, monthly: 175, february: 175 },
            { from: 10001, to: null, monthly: 200, february: 300 }
        ]
    },
    'Karnataka': {
        maxAnnual: 2400, slabs: [
            { from: 0, to: 15000, monthly: 0 },
            { from: 15001, to: 25000, monthly: 200 },
            { from: 25001, to: null, monthly: 200 }
        ]
    },
    'Gujarat': {
        maxAnnual: 2500, slabs: [
            { from: 0, to: 5999, monthly: 0 },
            { from: 6000, to: 8999, monthly: 80 },
            { from: 9000, to: 11999, monthly: 150 },
            { from: 12000, to: null, monthly: 200 }
        ]
    },
    'Tamil Nadu': {
        maxAnnual: 2500, slabs: [
            { from: 0, to: 21000, monthly: 0 },
            { from: 21001, to: 30000, monthly: 135 },
            { from: 30001, to: 45000, monthly: 315 },
            { from: 45001, to: 60000, monthly: 690 },
            { from: 60001, to: 75000, monthly: 1025 },
            { from: 75001, to: null, monthly: 1250 }
        ]
    },
    'West Bengal': {
        maxAnnual: 2500, slabs: [
            { from: 0, to: 10000, monthly: 0 },
            { from: 10001, to: 15000, monthly: 110 },
            { from: 15001, to: 25000, monthly: 130 },
            { from: 25001, to: 40000, monthly: 150 },
            { from: 40001, to: null, monthly: 200 }
        ]
    }
};

/**
 * Get PT slabs and annual cap for a state from DB or defaults
 */
async function getSlabConfig(state) {
    try {
        const dbSlab = await ProfessionalTaxSlab.findOne({ state, isActive: true });
        if (dbSlab && dbSlab.slabs.length > 0) {
            return { slabs: dbSlab.slabs, maxAnnual: dbSlab.maxAnnual || 2500 };
        }
    } catch (e) { /* fallback */ }
    const def = DEFAULT_SLABS[state] || DEFAULT_SLABS['Maharashtra'];
    return { slabs: def.slabs, maxAnnual: def.maxAnnual };
}

/**
 * Calculate raw monthly PT from slab (no annual cap check)
 */
function calculateFromSlab(grossSalary, slabs, isFebruary = false) {
    for (const slab of slabs) {
        const upper = slab.to || Infinity;
        if (grossSalary >= slab.from && grossSalary <= upper) {
            return slab.monthly; // Disable February bump on user request
        }
    }
    return 0;
}

/**
 * Simple PT calculation (backward compatible, no annual cap)
 */
async function calculate(grossSalary, state = 'Maharashtra', isFebruary = false) {
    const { slabs } = await getSlabConfig(state);
    const ptAmount = calculateFromSlab(grossSalary, slabs, isFebruary);
    return { state, grossSalary, ptAmount, isFebruary };
}

/**
 * FIXED: Calculate PT with annual cap enforcement
 * 
 * Before deducting PT:
 *   ytdPT = sum of ProfessionalTaxRecord for current FY
 *   if (ytdPT + currentPT) > maxAnnual → currentPT = maxAnnual - ytdPT
 *   if ytdPT >= maxAnnual → currentPT = 0
 * 
 * @param {string} userId
 * @param {number} grossSalary
 * @param {string} state
 * @param {boolean} isFebruary
 * @param {number} month
 * @param {number} year
 * @param {object} config - StatutoryConfig
 * @param {object} session - MongoDB session (optional)
 */
async function calculateWithCap(userId, grossSalary, state = 'Maharashtra', isFebruary = false, month, year, config = {}, session = null) {
    const { slabs, maxAnnual } = await getSlabConfig(state);
    let ptAmount = calculateFromSlab(grossSalary, slabs, isFebruary);

    if (ptAmount <= 0) {
        return { state, grossSalary, ptAmount: 0, isFebruary, ytdPT: 0, capped: false };
    }

    // Determine FY boundaries for YTD query
    let fyStartMonth, fyStartYear;
    if (month >= 4) {
        fyStartMonth = 4; fyStartYear = year;
    } else {
        fyStartMonth = 4; fyStartYear = year - 1;
    }

    // Build FY months range (April to current month - 1)
    const orConditions = [];
    let m = fyStartMonth, y = fyStartYear;
    while (!(m === month && y === year)) {
        orConditions.push({ month: m, year: y });
        m++;
        if (m > 12) { m = 1; y++; }
    }

    // Sum YTD PT
    let ytdPT = 0;
    if (orConditions.length > 0) {
        const sessionOpts = session ? { session } : {};
        const ytdResult = await ProfessionalTaxRecord.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId), $or: orConditions } },
            { $group: { _id: null, total: { $sum: '$ptAmount' } } }
        ]);
        ytdPT = ytdResult[0]?.total || 0;
    }

    // Enforce annual cap
    let capped = false;
    if (ytdPT >= maxAnnual) {
        ptAmount = 0;
        capped = true;
    } else if (ytdPT + ptAmount > maxAnnual) {
        ptAmount = maxAnnual - ytdPT;
        capped = true;
    }

    return {
        state,
        grossSalary,
        ptAmount,
        isFebruary,
        ytdPT,
        maxAnnual,
        capped
    };
}

module.exports = { calculate, calculateWithCap, getSlabConfig, calculateFromSlab };
