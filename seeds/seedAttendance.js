/**
 * Seed Script: Generate dummy attendance records for Rohit Samariya
 * Range: August 2025 – January 2026
 * Tests: On-time, Late, Early Exit, Auto-Checkout, Half-Day, Absent, Violations
 *
 * Usage: node seeds/seedAttendance.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const Violation = require('../models/Violation');

// --- Configuration ---
const EMPLOYEE_ID = '6996e899b991503c970be9b7';
const BRANCH_ID = '6995798577231c4844acb314';
const SHIFT_ID = '69933861739865714267b83e';

// Shift: assume 09:00 – 18:00 IST (UTC+5:30)
const SHIFT_START_H = 9;
const SHIFT_START_M = 0;
const SHIFT_END_H = 18;
const SHIFT_END_M = 0;
const ALLOWED_LATE_MIN = 15; // grace period
const FULL_DAY_MINUTES = 540; // 9 hours
const HALF_DAY_THRESHOLD = 240; // 4 hours = half day if less

// IST offset in ms
const IST_OFFSET = 5.5 * 60 * 60 * 1000;

function toUTC(year, month, day, hour, minute) {
    // Create IST time and convert to UTC
    const ist = new Date(year, month - 1, day, hour, minute, 0, 0);
    return new Date(ist.getTime() - IST_OFFSET);
}

function midnightIST(year, month, day) {
    return toUTC(year, month, day, 0, 0);
}

function randomMinutes(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isWeekend(year, month, day) {
    const d = new Date(year, month - 1, day);
    return d.getDay() === 0 || d.getDay() === 6; // Sunday or Saturday
}

function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

/**
 * Scenario types:
 *  ON_TIME      – checks in on time, checks out on time
 *  LATE         – checks in 20-60 min late, checks out on time -> LATE violation
 *  EARLY_EXIT   – checks in on time, checks out 30-90 min early -> EARLY_EXIT violation
 *  LATE_AND_EARLY – both late and early exit
 *  HALF_DAY     – works only ~4 hours
 *  AUTO_CLOSED  – checks in but never checks out (auto-closed at midnight)
 *  ABSENT       – no attendance record (skip day)
 */
const SCENARIOS = [
    'ON_TIME', 'ON_TIME', 'ON_TIME', 'ON_TIME', 'ON_TIME',     // ~5/15 on-time
    'ON_TIME', 'ON_TIME', 'ON_TIME',                             // 8/15 on-time
    'LATE', 'LATE', 'LATE',                                       // 3/15 late
    'EARLY_EXIT',                                                  // 1/15 early exit
    'LATE_AND_EARLY',                                              // 1/15 both
    'HALF_DAY',                                                    // 1/15 half day
    'AUTO_CLOSED',                                                 // 1/15 auto-closed
];

// Some days will be ABSENT (we'll randomly skip ~2 working days per month)

function pickScenario(dayOfMonth) {
    // Make it deterministic based on day so it's reproducible
    return SCENARIOS[dayOfMonth % SCENARIOS.length];
}

async function generateMonth(year, month) {
    const totalDays = daysInMonth(year, month);
    const records = [];
    const violations = [];
    let absentCount = 0;
    const maxAbsent = 2; // ~2 absent days per month

    for (let day = 1; day <= totalDays; day++) {
        if (isWeekend(year, month, day)) continue;

        // Random absent days (2nd and 17th of each month for consistency)
        if (day === 2 || day === 17) {
            absentCount++;
            // Create an ABSENT record
            records.push({
                user: new mongoose.Types.ObjectId(EMPLOYEE_ID),
                branch: new mongoose.Types.ObjectId(BRANCH_ID),
                shift: new mongoose.Types.ObjectId(SHIFT_ID),
                date: midnightIST(year, month, day),
                punches: [],
                totalWorkingMinutes: 0,
                totalBreakMinutes: 0,
                lateMarked: false,
                earlyExitMarked: false,
                autoClosed: false,
                isOpen: false,
                openPunchIndex: null,
                status: 'ABSENT',
                suspiciousLocation: false
            });
            continue;
        }

        const scenario = pickScenario(day);
        let checkInH = SHIFT_START_H, checkInM = SHIFT_START_M;
        let checkOutH = SHIFT_END_H, checkOutM = SHIFT_END_M;
        let lateMarked = false, earlyExitMarked = false, autoClosed = false;
        let status = 'PRESENT';
        let totalWorkingMinutes = FULL_DAY_MINUTES;
        const violationTypes = [];

        switch (scenario) {
            case 'ON_TIME':
                // Check in 0-10 min early or exactly on time
                checkInM = SHIFT_START_M - randomMinutes(0, 10);
                if (checkInM < 0) { checkInM += 60; checkInH -= 1; }
                // Check out 0-15 min after shift end
                checkOutM = SHIFT_END_M + randomMinutes(0, 15);
                if (checkOutM >= 60) { checkOutM -= 60; checkOutH += 1; }
                totalWorkingMinutes = (checkOutH * 60 + checkOutM) - (checkInH * 60 + checkInM);
                break;

            case 'LATE':
                // Check in 20-60 min late
                const lateBy = randomMinutes(20, 60);
                checkInM = SHIFT_START_M + lateBy;
                checkInH = SHIFT_START_H + Math.floor(checkInM / 60);
                checkInM = checkInM % 60;
                lateMarked = true;
                violationTypes.push('LATE');
                // Normal checkout
                checkOutM = SHIFT_END_M + randomMinutes(0, 10);
                if (checkOutM >= 60) { checkOutM -= 60; checkOutH += 1; }
                totalWorkingMinutes = (checkOutH * 60 + checkOutM) - (checkInH * 60 + checkInM);
                break;

            case 'EARLY_EXIT':
                // Normal check in
                checkInM = SHIFT_START_M - randomMinutes(0, 5);
                if (checkInM < 0) { checkInM += 60; checkInH -= 1; }
                // Check out 30-90 min early
                const earlyBy = randomMinutes(30, 90);
                let totalOutMin = (SHIFT_END_H * 60 + SHIFT_END_M) - earlyBy;
                checkOutH = Math.floor(totalOutMin / 60);
                checkOutM = totalOutMin % 60;
                earlyExitMarked = true;
                violationTypes.push('EARLY_EXIT');
                totalWorkingMinutes = (checkOutH * 60 + checkOutM) - (checkInH * 60 + checkInM);
                break;

            case 'LATE_AND_EARLY':
                // Late by 25-45 min
                const lateMins = randomMinutes(25, 45);
                checkInM = SHIFT_START_M + lateMins;
                checkInH = SHIFT_START_H + Math.floor(checkInM / 60);
                checkInM = checkInM % 60;
                lateMarked = true;
                violationTypes.push('LATE');
                // Early by 30-60 min
                const earlyMins = randomMinutes(30, 60);
                let outMin = (SHIFT_END_H * 60 + SHIFT_END_M) - earlyMins;
                checkOutH = Math.floor(outMin / 60);
                checkOutM = outMin % 60;
                earlyExitMarked = true;
                violationTypes.push('EARLY_EXIT');
                totalWorkingMinutes = (checkOutH * 60 + checkOutM) - (checkInH * 60 + checkInM);
                break;

            case 'HALF_DAY':
                // Check in on time, check out after 4 hours
                checkInM = SHIFT_START_M;
                checkOutH = SHIFT_START_H + 4;
                checkOutM = SHIFT_START_M + randomMinutes(0, 30);
                if (checkOutM >= 60) { checkOutM -= 60; checkOutH += 1; }
                status = 'HALF_DAY';
                totalWorkingMinutes = (checkOutH * 60 + checkOutM) - (checkInH * 60 + checkInM);
                break;

            case 'AUTO_CLOSED':
                // Check in on time, no checkout (auto-closed at 23:59)
                checkInM = SHIFT_START_M - randomMinutes(0, 5);
                if (checkInM < 0) { checkInM += 60; checkInH -= 1; }
                checkOutH = 23;
                checkOutM = 59;
                autoClosed = true;
                violationTypes.push('AUTO_CHECKOUT');
                totalWorkingMinutes = (checkOutH * 60 + checkOutM) - (checkInH * 60 + checkInM);
                break;
        }

        const checkIn = toUTC(year, month, day, checkInH, checkInM);
        const checkOut = toUTC(year, month, day, checkOutH, checkOutM);
        const dateVal = midnightIST(year, month, day);

        const record = {
            user: new mongoose.Types.ObjectId(EMPLOYEE_ID),
            branch: new mongoose.Types.ObjectId(BRANCH_ID),
            shift: new mongoose.Types.ObjectId(SHIFT_ID),
            date: dateVal,
            punches: [{
                checkIn: checkIn,
                checkOut: checkOut,
                checkInLocation: { latitude: 19.2094, longitude: 72.8545 }, // Mumbai
                checkOutLocation: { latitude: 19.2094, longitude: 72.8545 },
                autoClosed: autoClosed
            }],
            totalWorkingMinutes: Math.max(0, totalWorkingMinutes),
            totalBreakMinutes: 0,
            lateMarked,
            earlyExitMarked,
            autoClosed,
            isOpen: false,
            openPunchIndex: null,
            status,
            suspiciousLocation: false
        };

        records.push(record);

        // Create violations
        for (const vType of violationTypes) {
            violations.push({
                user: new mongoose.Types.ObjectId(EMPLOYEE_ID),
                branch: new mongoose.Types.ObjectId(BRANCH_ID),
                attendance: null, // Will be filled after insert
                type: vType,
                date: dateVal,
                month: month,
                year: year,
                _tempDay: day // temp reference to link after insert
            });
        }
    }

    return { records, violations };
}

async function seed() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Clean existing data for this employee in the date range
        const startDate = midnightIST(2025, 8, 1);
        const endDate = midnightIST(2026, 2, 1);

        const deletedAttendance = await Attendance.deleteMany({
            user: new mongoose.Types.ObjectId(EMPLOYEE_ID),
            date: { $gte: startDate, $lt: endDate }
        });
        console.log(`🗑  Cleared ${deletedAttendance.deletedCount} existing attendance records`);

        const deletedViolations = await Violation.deleteMany({
            user: new mongoose.Types.ObjectId(EMPLOYEE_ID),
            $or: [
                { year: 2025, month: { $gte: 8 } },
                { year: 2026, month: { $lte: 1 } }
            ]
        });
        console.log(`🗑  Cleared ${deletedViolations.deletedCount} existing violation records`);

        // Generate data for each month
        const months = [
            { year: 2025, month: 8 },  // August 2025
            { year: 2025, month: 9 },  // September 2025
            { year: 2025, month: 10 }, // October 2025
            { year: 2025, month: 11 }, // November 2025
            { year: 2025, month: 12 }, // December 2025
            { year: 2026, month: 1 },  // January 2026
        ];

        let totalRecords = 0;
        let totalViolations = 0;
        const stats = {};

        for (const { year, month } of months) {
            const { records, violations } = await generateMonth(year, month);
            const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

            // Insert attendance records
            const inserted = await Attendance.insertMany(records, { ordered: false }).catch(err => {
                // Handle duplicate key errors gracefully
                if (err.insertedDocs) return err.insertedDocs;
                console.warn(`⚠️  Some records for ${monthName} may already exist`);
                return [];
            });

            const insertedRecords = Array.isArray(inserted) ? inserted : [];

            // Link violations to attendance records and insert
            if (violations.length > 0 && insertedRecords.length > 0) {
                // Build a map of date -> attendance _id
                const dateMap = {};
                for (const rec of insertedRecords) {
                    if (rec && rec.date && rec._id) {
                        dateMap[rec.date.toISOString()] = rec._id;
                    }
                }

                const validViolations = violations.map(v => {
                    const dateKey = midnightIST(year, month, v._tempDay).toISOString();
                    const attendanceId = dateMap[dateKey];
                    if (!attendanceId) return null;
                    const { _tempDay, ...violationData } = v;
                    return { ...violationData, attendance: attendanceId };
                }).filter(Boolean);

                if (validViolations.length > 0) {
                    await Violation.insertMany(validViolations, { ordered: false }).catch(() => { });
                    totalViolations += validViolations.length;
                }
            }

            // Stats
            const present = records.filter(r => r.status === 'PRESENT').length;
            const halfDay = records.filter(r => r.status === 'HALF_DAY').length;
            const absent = records.filter(r => r.status === 'ABSENT').length;
            const late = records.filter(r => r.lateMarked).length;
            const early = records.filter(r => r.earlyExitMarked).length;
            const auto = records.filter(r => r.autoClosed).length;

            stats[monthName] = { total: records.length, present, halfDay, absent, late, early, auto };
            totalRecords += records.length;

            console.log(`📅 ${monthName}: ${records.length} records (${present}P / ${halfDay}H / ${absent}A | ${late} late, ${early} early, ${auto} auto)`);
        }

        console.log('\n=== SUMMARY ===');
        console.log(`✅ Total attendance records: ${totalRecords}`);
        console.log(`⚠️  Total violations: ${totalViolations}`);
        console.log('\n📊 Monthly Breakdown:');
        console.table(stats);

        console.log('\n🎉 Attendance seeding complete!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

seed();
