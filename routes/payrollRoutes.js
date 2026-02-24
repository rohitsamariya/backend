const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
    runCycle,
    processEmployee,
    listPayroll,
    getPayrollDetail,
    getPayslip,
    finalizePayroll,
    finalizeCycle,
    saveSalaryStructure,
    getSalaryStructure,
    getStatutoryReport,
    getBranchSummary,
    seedConfig,
    getConfig,
    getCycles,
    downloadPayslipPDF,
    recalculatePayroll,
    sendEmailPayslip
} = require('../controllers/payrollController');

// Global Protection
router.use(protect);

// Payroll Listing & Detail
router.get('/', authorize('HR', 'ADMIN'), listPayroll);
router.get('/:id', authorize('ADMIN', 'HR', 'EMPLOYEE'), getPayrollDetail);

// Payroll Processing
router.post('/run-cycle', authorize('ADMIN'), runCycle);
router.post('/process/:userId', authorize('HR', 'ADMIN'), processEmployee);
router.get('/payslip/:id', authorize('ADMIN', 'HR', 'EMPLOYEE'), getPayslip);
router.get('/:id/payslip-pdf', authorize('ADMIN', 'HR', 'EMPLOYEE'), downloadPayslipPDF);

// Actions
router.post('/:id/recalculate', authorize('HR', 'ADMIN'), recalculatePayroll);
router.post('/:id/send-email', authorize('HR', 'ADMIN'), sendEmailPayslip);
router.put('/:id/finalize', authorize('ADMIN'), finalizePayroll);
router.put('/finalize-cycle/:cycleId', authorize('ADMIN'), finalizeCycle);

// Salary Structure
router.post('/salary-structure/:userId', authorize('HR', 'ADMIN'), saveSalaryStructure);
router.get('/salary-structure/:userId', authorize('HR', 'ADMIN'), getSalaryStructure);

// Reports
router.get('/statutory-report', authorize('ADMIN'), getStatutoryReport);
router.get('/branch-summary', authorize('HR', 'ADMIN'), getBranchSummary);

// Cycles
router.get('/cycles', authorize('ADMIN'), getCycles);

// Configuration
router.get('/config', authorize('ADMIN'), getConfig);
router.post('/seed-config', authorize('ADMIN'), seedConfig);

module.exports = router;

