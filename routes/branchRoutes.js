const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
    createBranch,
    getBranches,
    updateBranch,
    deleteBranch,
    reactivateBranch
} = require('../controllers/branchController');

router.use(protect);

// Routes
router.route('/')
    .post(authorize('ADMIN'), createBranch)
    .get(authorize('ADMIN', 'HR'), getBranches);

router.route('/:id')
    .put(authorize('ADMIN'), updateBranch)
    .delete(authorize('ADMIN'), deleteBranch);

router.route('/:id/reactivate')
    .put(authorize('ADMIN'), reactivateBranch);

module.exports = router;
