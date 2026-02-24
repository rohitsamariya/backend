const Holiday = require('../models/Holiday');
const User = require('../models/User');

// @desc    Get Holidays for the Employee's Assigned Branch
// @route   GET /api/employee/holidays
// @access  EMPLOYEE (Active)
exports.getBranchHolidays = async (req, res) => {
    try {
        const userId = req.user._id;

        // Fetch User to determine assigned branch
        const user = await User.findById(userId).select('branch status dateOfBirth');

        if (!user || user.status !== 'ACTIVE') {
            return res.status(403).json({ success: false, error: 'Unauthorized or inactive user.' });
        }

        const currentYear = new Date().getFullYear();
        const startOfYear = new Date(currentYear, 0, 1);
        const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59);

        // Find all holidays for the current year (Making them global)
        const holidays = await Holiday.find({
            date: {
                $gte: startOfYear,
                $lte: endOfYear
            }
        }).sort({ date: 1 });

        // Transform to plain objects to allow adding dynamic data
        let holidayList = holidays.map(h => h.toObject());

        // Inject "Birthday special" if dateOfBirth is present
        if (user.dateOfBirth) {
            const dob = new Date(user.dateOfBirth);
            const birthdayThisYear = new Date(currentYear, dob.getMonth(), dob.getDate());

            holidayList.push({
                _id: 'birthday-special',
                name: 'Birthday special',
                date: birthdayThisYear,
                type: 'Company',
                description: 'Happy Birthday! This is your special holiday.'
            });

            // Re-sort chronologically after injection
            holidayList.sort((a, b) => new Date(a.date) - new Date(b.date));
        }

        res.status(200).json({
            success: true,
            data: holidayList
        });

    } catch (error) {
        console.error('Fetch Employee Holidays Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};
