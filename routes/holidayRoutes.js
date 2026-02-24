const express = require('express');
const router = express.Router();
const { getHolidays, createHoliday, updateHoliday, deleteHoliday } = require('../controllers/holidayController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect); // All routes protected

router.route('/')
    .get(getHolidays)
    .post(authorize('ADMIN'), createHoliday);

router.route('/:id')
    .put(authorize('ADMIN'), updateHoliday)
    .delete(authorize('ADMIN'), deleteHoliday);

module.exports = router;
