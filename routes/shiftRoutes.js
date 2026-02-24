const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const {
    createShift,
    getShifts,
    updateShift,
    assignShift
} = require('../controllers/shiftController');

router.use(protect);

router.post('/', authorize('ADMIN', 'HR'), createShift);
router.get('/', authorize('ADMIN', 'HR', 'MANAGER'), getShifts);
router.put('/:id', authorize('ADMIN', 'HR'), updateShift);
router.put('/assign/:userId', authorize('ADMIN', 'HR'), assignShift);

module.exports = router;
