const { runMonthlyPayroll } = require('../services/autoPayrollService');

// @desc    Trigger Monthly Payroll Manually
// @route   POST /api/payroll/trigger-monthly-batch
// @access  ADMIN Only
exports.triggerManualPayroll = async (req, res) => {
    try {
        // Run async without blocking response? Or block?
        // Blocking is better for "Trigger" feedback. 
        // But processing takes time. Let's trigger and return "Started".

        console.log('Manual Payroll Triggered by Admin');

        // Run in background
        runMonthlyPayroll(new Date())
            .then(() => console.log('Manual Payroll Finished'))
            .catch(err => console.error('Manual Payroll Failed', err));

        res.status(200).json({ success: true, message: 'Payroll Batch Process Started. Check logs/batches for status.' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};
