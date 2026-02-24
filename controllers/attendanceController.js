const Attendance = require('../models/Attendance');
const Branch = require('../models/Branch');
const Shift = require('../models/Shift');
const User = require('../models/User');
const Violation = require('../models/Violation');
const CheckInAttempt = require('../models/CheckInAttempt');
const { isWithinRadius, calculateDistanceInMeters } = require('../utils/geoUtils');
const { handleViolation } = require('../utils/violationEngine');
const { DateTime } = require('luxon');

// CRITICAL: Fail if dependencies missing
if (typeof handleViolation !== 'function') {
    throw new Error('Critical Dependency Missing: handleViolation is not a function');
}

// Helper: Parse HH:mm to minutes
const toMinutes = (timeStr) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
};

// @desc    Check In
// @route   POST /api/attendance/check-in
// @access  Private (Active Users)
exports.checkIn = async (req, res) => {
    try {
        const { latitude, longitude } = req.body;
        const user = req.user; // From protect middleware

        // 1. STRICT ACTIVE VALIDATION
        if (user.status !== 'ACTIVE') {
            return res.status(403).json({ success: false, error: 'User is not ACTIVE' });
        }
        if (!user.branch) {
            return res.status(400).json({ success: false, error: 'User must have an assigned Branch' });
        }
        if (!user.shift) {
            return res.status(400).json({ success: false, error: 'User must have an assigned Shift' });
        }

        const branch = await Branch.findById(user.branch);
        if (!branch) {
            return res.status(404).json({ success: false, error: 'Branch not found' });
        }
        if (!branch.isActive) {
            return res.status(403).json({ success: false, error: 'Branch is inactive. Check-in disabled.' });
        }

        // Validate Branch Timezone
        const timezone = branch.timezone || 'Asia/Kolkata';
        const now = DateTime.now().setZone(timezone);
        if (!now.isValid) {
            return res.status(500).json({ success: false, error: `Invalid Branch Timezone: ${timezone}` });
        }

        // --- Determine Status (Holiday/WorkingDay) ---
        const Holiday = require('../models/Holiday');
        const todayDayName = now.toFormat('cccc'); // 'Monday', 'Tuesday'
        const workingDays = branch.workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const isWorkingDay = workingDays.includes(todayDayName);

        // Check for Holiday
        // Note: Holiday dates should be compared carefully. 
        // Assuming Holiday.date is stored as 00:00 UTC for the date.
        // We use todayMidnight (calculated below) for match.
        const todayMidnight = now.startOf('day').toUTC().toJSDate();
        const holiday = await Holiday.findOne({ date: todayMidnight });

        let initialStatus = 'PRESENT';
        if (holiday) initialStatus = 'HOLIDAY';
        else if (!isWorkingDay) initialStatus = 'WEEK_OFF';


        // 2. GEO VALIDATION
        let geoResult;
        try {
            geoResult = isWithinRadius(
                latitude,
                longitude,
                branch.latitude,
                branch.longitude,
                branch.radiusInMeters
            );
        } catch (err) {
            return res.status(400).json({ success: false, error: err.message });
        }

        // 3. STRICT 0,0 HANDLING
        // Block 0,0 unless branch is actually at 0,0
        if (geoResult.normalizedUserLat === 0 && geoResult.normalizedUserLng === 0) {
            if (branch.latitude !== 0 || branch.longitude !== 0) {
                await CheckInAttempt.create({
                    user: user._id,
                    branch: branch._id,
                    attemptLocation: { latitude: 0, longitude: 0 },
                    distanceMeters: geoResult.distance,
                    failureReason: 'NULL_ISLAND_SPOOF'
                }).catch(err => console.error("Failed to log CheckInAttempt:", err));
                return res.status(400).json({ success: false, error: 'Invalid Coordinates: Null island (0,0) detected.' });
            }
        }

        if (!geoResult.within) {
            await CheckInAttempt.create({
                user: user._id,
                branch: branch._id,
                attemptLocation: {
                    latitude: geoResult.normalizedUserLat,
                    longitude: geoResult.normalizedUserLng
                },
                distanceMeters: geoResult.distance,
                failureReason: 'OUT_OF_BOUNDS'
            }).catch(err => console.error("Failed to log CheckInAttempt:", err));
            return res.status(403).json({
                success: false,
                error: `Outside allowed radius. Distance: ${geoResult.distance.toFixed(2)}m (Max: ${branch.radiusInMeters}m)`
            });
        }

        // 4. FIND / CREATE ATTENDANCE
        // Timezone Safe Midnight (Stored as UTC equivalent of Branch Midnight)
        // 4. FIND / CREATE ATTENDANCE
        // Timezone Safe Midnight (Stored as UTC equivalent of Branch Midnight)
        // const todayMidnight = now.startOf('day').toUTC().toJSDate(); // MOVED UP

        let attendance = await Attendance.findOne({
            user: user._id,
            date: todayMidnight
        });

        // 5. CHECK LOGIC & ANTI-SPOOF JUMP
        if (attendance) {
            // Deterministic Open Punch Control
            if (attendance.isOpen) {
                return res.status(400).json({ success: false, error: 'You are already checked in. Please check out first.' });
            }

            // ANTI-SPOOF: Impossible Jump from Last Punch
            // Check last punch (checkOut or checkIn location)
            const lastPunch = attendance.punches[attendance.punches.length - 1];
            if (lastPunch) {
                const prevLoc = lastPunch.checkOutLocation || lastPunch.checkInLocation;
                const prevTime = lastPunch.checkOut || lastPunch.checkIn; // Date Object

                if (prevLoc && prevLoc.latitude && prevTime) {
                    const diffMs = new Date().getTime() - new Date(prevTime).getTime();
                    const diffMinutes = diffMs / 1000 / 60;

                    const jumpDist = calculateDistanceInMeters(
                        geoResult.normalizedUserLat, geoResult.normalizedUserLng,
                        prevLoc.latitude, prevLoc.longitude
                    );

                    // THRESHOLD: > 5000m in < 1 minute
                    if (diffMinutes < 1 && jumpDist > 5000) {
                        console.warn(`[Suspicious Geo] User ${user._id} jumped ${jumpDist}m in ${diffMinutes.toFixed(2)}min`);

                        await CheckInAttempt.create({
                            user: user._id,
                            branch: branch._id,
                            attemptLocation: {
                                latitude: geoResult.normalizedUserLat,
                                longitude: geoResult.normalizedUserLng
                            },
                            distanceMeters: geoResult.distance,
                            failureReason: 'IMPOSSIBLE_TRAVEL'
                        }).catch(err => console.error("Failed to log CheckInAttempt:", err));

                        return res.status(403).json({ success: false, error: 'Suspicious location change detected (Impossible Travel).' });
                    }
                }
            }

            // ADD PUNCH
            attendance.punches.push({
                checkIn: new Date(),
                checkInLocation: {
                    latitude: geoResult.normalizedUserLat,
                    longitude: geoResult.normalizedUserLng
                }
            });
            attendance.isOpen = true;
            attendance.openPunchIndex = attendance.punches.length - 1; // 0-based index

        } else {
            // CREATE NEW
            attendance = new Attendance({
                user: user._id,
                branch: user.branch,
                shift: user.shift,
                date: todayMidnight, // Stored UTC midnight
                status: initialStatus, // Use the determined initialStatus
                isOpen: true,
                punches: [{
                    checkIn: new Date(),
                    checkInLocation: {
                        latitude: geoResult.normalizedUserLat,
                        longitude: geoResult.normalizedUserLng
                    }
                }],
                openPunchIndex: 0
            });
        }

        // 6. LATE CHECK (First Punch Only)
        if (attendance.punches.length === 1) {
            const shift = await Shift.findById(user.shift);
            if (shift) {
                const shiftStartParts = shift.startTime.split(':');
                // Create shift start time relative to "now" (Branch Timezone)
                let shiftStart = now.set({
                    hour: parseInt(shiftStartParts[0]),
                    minute: parseInt(shiftStartParts[1]),
                    second: 0,
                    millisecond: 0
                });

                const lateThreshold = shiftStart.plus({ minutes: shift.allowedLateMinutes });
                // CheckIn time is "now"
                if (now > lateThreshold) {
                    attendance.lateMarked = true;
                    await handleViolation(user, attendance, 'LATE', todayMidnight, timezone);
                }
            }
        }

        await attendance.save();

        res.status(200).json({ success: true, message: 'Checked In Successfully', data: attendance });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Check Out
// @route   POST /api/attendance/check-out
// @access  Private (Active Users)
exports.checkOut = async (req, res) => {
    try {
        const { latitude, longitude } = req.body;
        const user = req.user;

        // 1. STRICT ACTIVE VALIDATION
        if (user.status !== 'ACTIVE') return res.status(403).json({ success: false, error: 'User is not ACTIVE' });
        if (!user.branch) return res.status(400).json({ success: false, error: 'User must have an assigned Branch' });

        const branch = await Branch.findById(user.branch);
        if (!branch) return res.status(404).json({ success: false, error: 'Branch not found' });
        if (!branch.isActive) return res.status(403).json({ success: false, error: 'Branch is inactive. Check-out disabled.' });

        const timezone = branch.timezone || 'Asia/Kolkata';
        const now = DateTime.now().setZone(timezone);

        // 2. GEO VALIDATION (Strict)
        let geoResult;
        try {
            geoResult = isWithinRadius(latitude, longitude, branch.latitude, branch.longitude, branch.radiusInMeters);
        } catch (err) {
            return res.status(400).json({ success: false, error: err.message });
        }

        if (geoResult.normalizedUserLat === 0 && geoResult.normalizedUserLng === 0) {
            if (branch.latitude !== 0 || branch.longitude !== 0) {
                return res.status(400).json({ success: false, error: 'Invalid Coordinates: Null island (0,0) detected.' });
            }
        }

        if (!geoResult.within) {
            return res.status(403).json({
                success: false,
                error: `Outside allowed radius. Distance: ${geoResult.distance.toFixed(2)}m (Max: ${branch.radiusInMeters}m). Cannot check out.`
            });
        }

        // 3. FIND ATTENDANCE
        const todayMidnight = now.startOf('day').toUTC().toJSDate();
        const attendance = await Attendance.findOne({ user: user._id, date: todayMidnight });

        if (!attendance) {
            return res.status(400).json({ success: false, error: 'No attendance record found.' });
        }
        if (attendance.autoClosed) {
            return res.status(400).json({ success: false, error: 'Attendance was auto-closed. Cannot update manually.' });
        }

        // 4. CONCURRENCY & STATE CHECK
        if (!attendance.isOpen || attendance.openPunchIndex === null) {
            return res.status(400).json({ success: false, error: 'You are not checked in.' });
        }

        // Index Safety Check
        if (attendance.openPunchIndex >= attendance.punches.length) {
            // Corruption recovery
            attendance.isOpen = false;
            attendance.openPunchIndex = null;
            await attendance.save();
            return res.status(500).json({ success: false, error: 'Data State Error: Punch index out of bounds. Resetting state.' });
        }

        const currentPunch = attendance.punches[attendance.openPunchIndex];
        if (!currentPunch || currentPunch.checkOut) {
            attendance.isOpen = false;
            attendance.openPunchIndex = null;
            await attendance.save();
            return res.status(400).json({ success: false, error: 'Current punch already closed. State reset.' });
        }

        // 5. ANTI-SPOOF JUMP CHECK
        const prevTime = currentPunch.checkIn;
        const prevLoc = currentPunch.checkInLocation;
        if (prevLoc && prevLoc.latitude) {
            const diffMs = new Date().getTime() - new Date(prevTime).getTime();
            const diffMinutes = diffMs / 1000 / 60;
            const jumpDist = calculateDistanceInMeters(
                geoResult.normalizedUserLat, geoResult.normalizedUserLng,
                prevLoc.latitude, prevLoc.longitude
            );
            if (diffMinutes < 1 && jumpDist > 5000) {
                return res.status(403).json({ success: false, error: 'Suspicious location change detected (Impossible Travel).' });
            }
        }

        // 6. CLOSE PUNCH
        currentPunch.checkOut = new Date();
        currentPunch.checkOutLocation = {
            latitude: geoResult.normalizedUserLat,
            longitude: geoResult.normalizedUserLng
        };
        attendance.isOpen = false;
        attendance.openPunchIndex = null;

        // 7. CALCULATE TOTALS & STATUS
        const shift = await Shift.findById(user.shift);
        if (shift) {
            let totalWorkingMs = 0;
            let totalBreakMs = 0;

            for (let i = 0; i < attendance.punches.length; i++) {
                const p = attendance.punches[i];
                if (p.checkIn && p.checkOut) {
                    totalWorkingMs += (new Date(p.checkOut) - new Date(p.checkIn));
                }
                if (i > 0) {
                    const prev = attendance.punches[i - 1];
                    if (prev.checkOut && p.checkIn) {
                        totalBreakMs += (new Date(p.checkIn) - new Date(prev.checkOut));
                    }
                }
            }

            attendance.totalWorkingMinutes = Math.floor(totalWorkingMs / 1000 / 60);
            attendance.totalBreakMinutes = Math.floor(totalBreakMs / 1000 / 60);

            // Shift Duration (Overnight Logic)
            let startMins = toMinutes(shift.startTime);
            let endMins = toMinutes(shift.endTime);
            if (endMins < startMins) endMins += (24 * 60); // Add 24 hours
            const shiftDuration = endMins - startMins;

            // STATUS CALCULATION (Using allowedLateMinutes as "Buffer" or just logic?)
            // Req: FULL DAY -> worked >= shiftDuration - allowedLateMinutes
            const fullDayThreshold = shiftDuration - (shift.allowedLateMinutes || 0);
            // NOTE: Usually Late Minutes applies to START time, but prompt requested this logic for "Full Day Coverage".
            // If strictly following prompt:
            const halfDayThreshold = shiftDuration * 0.5;

            if (attendance.totalWorkingMinutes >= fullDayThreshold) {
                attendance.status = 'PRESENT';
            } else if (attendance.totalWorkingMinutes >= halfDayThreshold) {
                attendance.status = 'HALF_DAY';
            } else {
                attendance.status = 'ABSENT';
            }

            // EARLY EXIT LOGIC
            // Convert shift.endTime to Today's occurrence
            // If overnight, and now is before midnight... wait. 
            // Easiest way: Compare Time portions using Luxon

            let shiftEndDT = now.set({
                hour: parseInt(shift.endTime.split(':')[0]),
                minute: parseInt(shift.endTime.split(':')[1]),
                second: 0
            });
            // If overnight and we are past midnight? Or before?
            // "CheckOut" happened "now". 
            // If shift is 22:00 to 06:00.
            // If now is 05:50. shiftEnd is 06:00 today. Correct.
            // If now is 23:00. shiftEnd (06:00) is 'tomorrow' relative to start.. or 'today' relative to now?
            // Correct approach: Find the Shift End that corresponds to this user's shift.
            // But we can just use the shift duration logic or stick to simple time comparison if strict shift.
            // Simplest: If now < shiftEnd (adjusted for overnight if needed).

            // Override: If shift is overnight (end < start), and now.hour > start.hour, then shiftEnd is "Tomorrow".
            // If now.hour < end.hour, shiftEnd is "Today". 
            // Complex. Let's use the 'minutes from midnight' approach for comparison if simple.
            // Or rely on Luxon.

            // FIX: If shift crosses midnight, handle wrap. 
            // We'll trust standard time comparison if shiftEndDT is set correctly relative to now.
            // If (start > end), shift crosses midnight.
            if (toMinutes(shift.startTime) > toMinutes(shift.endTime)) {
                // It's an overnight shift.
                // If now is e.g. 23:00, shift end is tomorrow 06:00.
                // If now is 05:00, shift end is today 06:00.
                // If now.hour > start.hour (approx), we assume end is +1 day.
                // Reliable Check: If now is "close" to end time? 
                // Let's assume most checkouts happen near end time.
                if (now.hour > 12 && parseInt(shift.endTime.split(':')[0]) < 12) {
                    shiftEndDT = shiftEndDT.plus({ days: 1 });
                }
            }

            const earlyLimit = shiftEndDT.minus({ minutes: shift.allowedEarlyExitMinutes });

            if (now < earlyLimit) {
                if (!attendance.earlyExitMarked) {
                    attendance.earlyExitMarked = true;
                    await handleViolation(user, attendance, 'EARLY_EXIT', todayMidnight, timezone);
                }
            } else {
                // REVERSAL SAFETY
                if (attendance.earlyExitMarked) {
                    attendance.earlyExitMarked = false;
                    // Strict Delete
                    await Violation.deleteOne({
                        attendance: attendance._id,
                        type: 'EARLY_EXIT'
                    });
                }
            }
        }

        await attendance.save();
        res.status(200).json({ success: true, message: 'Checked Out Successfully', data: attendance });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get Branch Attendance
exports.getBranchAttendance = async (req, res) => {
    try {
        const { branchId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const startIndex = (page - 1) * limit;

        // Security
        if (req.user.role === 'HR' && req.user.branch.toString() !== branchId) {
            return res.status(403).json({ success: false, error: 'Not authorized.' });
        }

        const stats = { branch: branchId };

        // Optional Date Filter (Strict)
        if (req.query.date) {
            // Need branch timezone to know what 'YYYY-MM-DD' means
            const branch = await Branch.findById(branchId);
            if (branch) {
                const tz = branch.timezone || 'Asia/Kolkata';
                const searchDate = DateTime.fromISO(req.query.date, { zone: tz }).startOf('day').toUTC().toJSDate();
                stats.date = searchDate;
            }
        }

        const total = await Attendance.countDocuments(stats);
        const attendance = await Attendance.find(stats)
            .sort({ date: -1 })
            .skip(startIndex)
            .limit(limit)
            .populate('user', 'name email role')
            .populate('shift', 'name startTime endTime');

        res.status(200).json({
            success: true,
            count: attendance.length,
            pagination: { total, page, pages: Math.ceil(total / limit) },
            data: attendance
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

exports.getMyAttendance = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const startIndex = (page - 1) * limit;

        const total = await Attendance.countDocuments({ user: req.user._id });
        const attendance = await Attendance.find({ user: req.user._id })
            .sort({ date: -1 })
            .skip(startIndex)
            .limit(limit)
            .populate('branch', 'name')
            .populate('shift', 'name startTime endTime');

        res.status(200).json({
            success: true,
            count: attendance.length,
            pagination: { total, page, pages: Math.ceil(total / limit) },
            data: attendance
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get Attendance By Date (single date or range via ?endDate=)
exports.getAttendanceByDate = async (req, res) => {
    try {
        const dateStr = req.params.date;
        const endDateStr = req.query.endDate; // Optional: for date range queries
        const page = parseInt(req.query.page) || 1;
        let limit = parseInt(req.query.limit) || 200;
        if (req.query.limit === '0' || req.query.limit === 'all') limit = 0;

        const startIndex = (page - 1) * (limit || 0);

        let query = {};

        // Optional User Filter
        if (req.query.userId) {
            query.user = req.query.userId;
        }

        // 1. Determine Branch Context
        let branchId = null;
        if (req.user.role === 'HR') {
            branchId = req.user.branch;
        } else if (req.user.role === 'ADMIN') {
            branchId = req.query.branchId;
            if (!branchId) {
                return res.status(400).json({ success: false, error: 'Branch ID is required for date filtering.' });
            }
        }

        query.branch = branchId;

        // 2. Resolve Date with Timezone
        const branch = await Branch.findById(branchId);
        if (!branch) {
            return res.status(404).json({ success: false, error: 'Branch not found' });
        }

        const tz = branch.timezone || 'Asia/Kolkata';
        const searchDT = DateTime.fromISO(dateStr, { zone: tz });

        if (!searchDT.isValid) {
            return res.status(400).json({ success: false, error: 'Invalid Date Format' });
        }

        // 3. Date filtering — single date or range
        if (endDateStr) {
            const endDT = DateTime.fromISO(endDateStr, { zone: tz });
            if (!endDT.isValid) {
                return res.status(400).json({ success: false, error: 'Invalid End Date Format' });
            }
            query.date = {
                $gte: searchDT.startOf('day').toUTC().toJSDate(),
                $lte: endDT.endOf('day').toUTC().toJSDate()
            };
        } else {
            query.date = searchDT.startOf('day').toUTC().toJSDate();
        }

        const total = await Attendance.countDocuments(query);
        const attendance = await Attendance.find(query)
            .sort({ date: -1 })
            .skip(startIndex)
            .limit(limit)
            .populate('user', 'name email role')
            .populate('branch', 'name')
            .populate('shift', 'name startTime endTime');

        res.status(200).json({
            success: true,
            count: attendance.length,
            pagination: { total, page, pages: Math.ceil(total / limit) },
            data: attendance
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};
