/**
 * Config Loader — Statutory Configuration from DB
 * 
 * Loads StatutoryConfig once per payroll cycle, caches in memory.
 * All services receive config as parameter instead of using hardcoded constants.
 */

const StatutoryConfig = require('../../models/payroll/StatutoryConfig');

// In-memory cache
let cachedConfig = null;
let cacheTimestamp = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Hardcoded fallback (only used if DB is completely empty)
const FALLBACK_CONFIG = {
    // EPF
    epfEmployeeRate: 12,
    epfEmployerRate: 12,
    epsRate: 8.33,
    epfEmployerNetRate: 3.67,
    epfWageCeiling: 15000,
    epfEnabled: true,
    epfAdminRate: 0.5,
    epfEdliRate: 0.5,

    // ESI
    esiEmployeeRate: 0.75,
    esiEmployerRate: 3.25,
    esiWageCeiling: 21000,
    esiEnabled: true,

    // TDS
    standardDeductionOld: 50000,
    standardDeductionNew: 75000,
    tdsExemptionLimitOld: 250000,
    tdsExemptionLimitNew: 300000,
    defaultRegime: 'NEW',
    cessRate: 4,

    // Bonus
    bonusEligibilityCeiling: 21000,
    bonusMinRate: 8.33,
    bonusMaxRate: 20,

    // Gratuity
    gratuityEligibilityYears: 5,

    // PT
    ptMaxAnnualMaharashtra: 2500,

    // Leave & Probation
    annualPaidLeaves: 18,
    probationPeriodMonths: 6,

    financialYear: '2025-26'
};

/**
 * Load statutory config from DB, fallback to hardcoded
 * Caches for 5 minutes to avoid repeated DB calls during bulk processing
 * 
 * @param {boolean} forceRefresh - Force cache refresh
 * @returns {object} Statutory config object
 */
async function loadConfig(forceRefresh = false) {
    const now = Date.now();

    // Return cached if valid
    if (!forceRefresh && cachedConfig && cacheTimestamp && (now - cacheTimestamp) < CACHE_TTL_MS) {
        return cachedConfig;
    }

    try {
        const dbConfig = await StatutoryConfig.findOne({ isActive: true }).lean();
        if (dbConfig) {
            cachedConfig = {
                ...FALLBACK_CONFIG,  // Defaults first
                ...dbConfig          // DB overrides
            };
            cacheTimestamp = now;
            return cachedConfig;
        }
    } catch (e) {
        console.error('ConfigLoader: Failed to load from DB, using fallback:', e.message);
    }

    // Fallback
    cachedConfig = { ...FALLBACK_CONFIG };
    cacheTimestamp = now;
    return cachedConfig;
}

/**
 * Invalidate cache (call after config update)
 */
function invalidateCache() {
    cachedConfig = null;
    cacheTimestamp = null;
}

module.exports = { loadConfig, invalidateCache, FALLBACK_CONFIG };
