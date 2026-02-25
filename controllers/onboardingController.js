const User = require('../models/User');
const { sendLifecycleEmail } = require('../services/emailService');

const { generateWelcomePDF } = require('../services/pdfService');

const STEP_LABELS = {
    1: 'Personal Details',
    2: 'Contact Details & KYC',
    3: 'Bank Details',
    4: 'PF & Statutory Details',
    5: 'Emergency Contact',
    6: 'Documents Upload',
    7: 'Final Declaration'
};

const getResumeLink = () => `${process.env.FRONTEND_URL || 'http://localhost:5173'}/onboarding`;

// @desc    Save Progress and Close (Send Email)
// @route   POST /api/onboarding/save-and-close
exports.saveAndClose = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const step = user.onboardingStep || 1;

        // Respond immediately
        res.status(200).json({ success: true, message: 'Progress saved and notification sent' });

        // Send Email in background
        setImmediate(async () => {
            try {
                const { generateProgressSavedEmail } = require('../services/emailTemplates/progressTemplate');
                const html = generateProgressSavedEmail(user.name, STEP_LABELS[step], step, getResumeLink());
                await sendLifecycleEmail(user, 'PROGRESS_SAVED', `Onboarding Progress Saved - Step ${step}`, html);
            } catch (err) {
                console.error('Background Progress Save Email failed:', err);
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error saving progress' });
    }
};

// @desc    Step 1: Basic Info
// @route   POST /api/onboarding/step/1
exports.saveStep1 = async (req, res) => {
    try {
        const { name, dob, gender, phoneNumber, address, city, state, pincode, residentialAddress } = req.body;

        if (!name || !dob || !gender) {
            return res.status(400).json({ success: false, error: 'Please provide all fields' });
        }

        const user = await User.findById(req.user.id);

        if (user.onboardingStep < 1) {
            return res.status(400).json({ success: false, error: 'Invalid step sequence' });
        }

        user.name = name;
        user.dateOfBirth = dob;
        user.gender = gender;
        user.phoneNumber = phoneNumber || '';
        user.address = {
            line1: address || residentialAddress,
            city: city || '',
            state: state || '',
            pincode: pincode || ''
        };

        if (user.onboardingStep === 1) {
            user.onboardingStep = 2;
        }

        await user.save();

        await user.save();

        res.status(200).json({ success: true, data: user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Step 2: KYC
// @route   POST /api/onboarding/step/2
exports.saveStep2 = async (req, res) => {
    try {
        const { aadhaarNumber, panNumber } = req.body;

        if (!aadhaarNumber || !panNumber) {
            return res.status(400).json({ success: false, error: 'Please provide Aadhaar and PAN' });
        }

        const user = await User.findById(req.user.id);

        if (user.onboardingStep < 2) {
            return res.status(400).json({ success: false, error: 'Please complete previous steps' });
        }

        user.aadhaarNumber = aadhaarNumber;
        user.panNumber = panNumber;

        if (user.onboardingStep === 2) {
            user.onboardingStep = 3;
        }

        await user.save();

        await user.save();

        res.status(200).json({ success: true, data: user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Step 3: Bank Details
// @route   POST /api/onboarding/step/3
exports.saveStep3 = async (req, res) => {
    try {
        const { bankAccountNumber, ifscCode, bankName, accountHolderName } = req.body;

        const user = await User.findById(req.user.id);

        if (user.onboardingStep < 3) {
            return res.status(400).json({ success: false, error: 'Please complete previous steps' });
        }

        user.bankDetails = {
            accountHolderName: accountHolderName,
            accountNumber: bankAccountNumber,
            ifscCode: ifscCode,
            bankName: bankName
        };

        if (user.onboardingStep === 3) {
            user.onboardingStep = 4;
        }

        await user.save();

        await user.save();

        res.status(200).json({ success: true, data: user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Step 4: PF
// @route   POST /api/onboarding/step/4
exports.saveStep4 = async (req, res) => {
    try {
        const { uanNumber, pfAccountNumber } = req.body;
        const user = await User.findById(req.user.id);

        if (user.onboardingStep < 4) {
            return res.status(400).json({ success: false, error: 'Please complete previous steps' });
        }

        user.uanNumber = uanNumber || '';
        user.pfAccountNumber = pfAccountNumber || '';
        user.isPfEligible = !!(uanNumber || pfAccountNumber);

        if (user.onboardingStep === 4) {
            user.onboardingStep = 5;
        }

        await user.save();

        await user.save();

        res.status(200).json({ success: true, data: user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Step 5: Emergency Contact
// @route   POST /api/onboarding/step/5
exports.saveStep5 = async (req, res) => {
    try {
        const { emergencyContact } = req.body;
        const user = await User.findById(req.user.id);

        if (user.onboardingStep < 5) {
            return res.status(400).json({ success: false, error: 'Please complete previous steps' });
        }

        user.emergencyContact = {
            name: emergencyContact.name,
            relation: emergencyContact.relationship,
            phone: emergencyContact.phone
        };

        if (user.onboardingStep === 5) {
            user.onboardingStep = 6;
        }

        await user.save();

        await user.save();

        res.status(200).json({ success: true, data: user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Step 6: Documents
// @route   POST /api/onboarding/step/6
exports.saveStep6 = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (user.onboardingStep < 6) {
            return res.status(400).json({ success: false, error: 'Please complete previous steps' });
        }

        if (req.files) {
            const upsertDoc = (type, file) => {
                const docIdx = user.documents.findIndex(d => d.type === type);
                const docData = {
                    type,
                    fileUrl: `/uploads/documents/${file.filename}`,
                    originalName: file.originalname,
                    uploadedAt: new Date()
                };
                if (docIdx > -1) {
                    user.documents[docIdx] = docData;
                } else {
                    user.documents.push(docData);
                }
            };

            if (req.files.aadhaarPhoto) upsertDoc('AADHAAR', req.files.aadhaarPhoto[0]);
            if (req.files.panPhoto) upsertDoc('PAN', req.files.panPhoto[0]);
            if (req.files.bankProof) upsertDoc('BANK_PROOF', req.files.bankProof[0]);
            if (req.files.educationCert) upsertDoc('EDUCATION', req.files.educationCert[0]);
            if (req.files.licenceCert) upsertDoc('LICENCE', req.files.licenceCert[0]);
            if (req.files.profilePhoto) user.profileImage = `/uploads/profile-images/${req.files.profilePhoto[0].filename}`;
        }

        if (user.onboardingStep === 6) {
            user.onboardingStep = 7;
        }

        await user.save();

        await user.save();

        res.status(200).json({ success: true, data: user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Step 7: Declaration & Finish
// @route   POST /api/onboarding/step/7
exports.saveStep7 = async (req, res) => {
    try {
        const { acceptedPolicies } = req.body;
        if (!acceptedPolicies) return res.status(400).json({ success: false, error: 'You must accept policies to continue' });

        const user = await User.findById(req.user.id).populate('branch').populate('shift');
        if (user.onboardingStep < 7) return res.status(400).json({ success: false, error: 'Please complete previous steps' });

        // Phase 4: Mark Progress
        user.onboardingStatus = 'COMPLETED';
        user.onboardingCompleted = true;
        user.isActive = true;
        await user.save();

        // Send Completion Email with PDF
        try {
            const pdfPath = await generateWelcomePDF(user, user.branch || {}, user.shift || {});

            const { generateWelcomeEmail } = require('../services/emailTemplates/welcomeTemplate');
            const html = generateWelcomeEmail(user, user.branch || {}, user.shift || {});

            const attachments = [{
                filename: 'Onboarding_Summary.pdf',
                path: pdfPath
            }];

            await sendLifecycleEmail(user, 'COMPLETION', 'Welcome to HRMS Company – Onboarding Complete', html, attachments);
        } catch (e) { console.error('Completion email or PDF failed:', e); }

        res.status(200).json({
            success: true,
            message: 'Onboarding completed successfully. Welcome to the team!',
            requiresRelogin: true
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};
