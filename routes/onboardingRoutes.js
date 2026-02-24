const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requireStatus } = require('../middleware/statusGuard');
const multer = require('multer');
const path = require('path');

const {
    saveStep1,
    saveStep2,
    saveStep3,
    saveStep4,
    saveStep5,
    saveStep6,
    saveStep7,
    saveAndClose
} = require('../controllers/onboardingController');

const upload = require('../middleware/uploadMiddleware');

// All routes require auth and ONBOARDING status
router.use(protect);
router.use(requireStatus('ONBOARDING'));

// Save and Close
router.post('/save-and-close', saveAndClose);

// Step-by-Step Routes
router.post('/step/1', saveStep1);
router.post('/step/2', saveStep2);
router.post('/step/3', saveStep3);
router.post('/step/4', saveStep4);
router.post('/step/5', saveStep5);

// Step 6: Documents (with multer error handling)
const uploadDocuments = upload.fields([
    { name: 'aadhaarPhoto', maxCount: 1 },
    { name: 'panPhoto', maxCount: 1 },
    { name: 'bankProof', maxCount: 1 },
    { name: 'educationCert', maxCount: 1 },
    { name: 'licenceCert', maxCount: 1 },
    { name: 'profilePhoto', maxCount: 1 }
]);

router.post('/step/6', (req, res, next) => {
    uploadDocuments(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ success: false, error: 'File too large. Maximum size is 10MB per file.' });
            }
            return res.status(400).json({ success: false, error: err.message || 'File upload error' });
        }
        next();
    });
}, saveStep6);

router.post('/step/7', saveStep7);

module.exports = router;
