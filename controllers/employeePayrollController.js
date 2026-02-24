const PayrollSummary = require('../models/PayrollSummary');
const User = require('../models/User');

// @desc    Get Employee Payroll Records
// @route   GET /api/employee/payroll
// @access  EMPLOYEE (Active)
exports.getPayrollSummary = async (req, res) => {
    try {
        const userId = req.user._id;
        let { month, year } = req.query;

        // Default to current month/year if not provided
        if (!month || !year) {
            const now = new Date();
            month = now.getMonth() + 1; // 1-12
            year = now.getFullYear();
        } else {
            month = parseInt(month);
            year = parseInt(year);
        }

        // Fetch user joining date to filter invalid requests
        const user = await User.findById(userId).select('createdAt');
        const joinDate = new Date(user.createdAt);
        const requestDate = new Date(year, month - 1, 1); // 1st day of requested month

        // Block requests for months before the employee joined
        // (If they joined March 15th, they can view March, but not February)
        if (requestDate < new Date(joinDate.getFullYear(), joinDate.getMonth(), 1)) {
            return res.status(400).json({
                success: false,
                error: 'Cannot request payroll data for a period before your joining date.'
            });
        }

        // Fetch the finalized payroll for this specific user, month, and year
        // We only show payrolls that are mathematically calculated and ideally 'finalized'
        // Depending on your Payroll system structure, it might just exist in PayrollSummary.
        const payroll = await PayrollSummary.findOne({
            user: userId,
            month: month,
            year: year
        });

        if (!payroll) {
            return res.status(404).json({
                success: false,
                error: 'No payroll record found for this period.'
            });
        }

        // Standardize response payload based on the actual schema
        const payrollData = {
            id: payroll._id,
            month: payroll.month,
            year: payroll.year,
            basicSalary: payroll.basic || 0,
            hra: payroll.hra || 0,
            da: payroll.da || 0,
            specialAllowance: payroll.specialAllowance || 0,
            otherAllowances: payroll.otherAllowances || 0,
            arrears: payroll.arrears || 0,

            pfDeduction: payroll.employeePF || 0,
            taxDeduction: payroll.tds || 0,
            professionalTax: payroll.professionalTax || 0,
            lopDeduction: payroll.lopDeduction || 0,
            otherDeductions: payroll.otherDeductions || 0,

            totalEarnings: payroll.grossSalary || 0,
            totalDeductions: payroll.totalDeductions || 0,
            netPay: payroll.netSalary || 0,
            status: payroll.status || 'PROCESSED',

            // Generate the URL for the PDF endpoint
            salarySlipUrl: `/api/payroll/${payroll._id}/payslip-pdf`
        };

        res.status(200).json({
            success: true,
            data: payrollData
        });

    } catch (error) {
        console.error('Fetch Employee Payroll Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};
