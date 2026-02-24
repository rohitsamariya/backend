const User = require('../models/User');

/**
 * @desc    Complete Onboarding for Employee
 * @route   PUT /api/employee/onboarding/complete
 * @access  EMPLOYEE (Private)
 */
exports.completeOnboarding = async (req, res) => {
    try {
        const {
            aadhaarNumber,
            residentialAddress,
            emergencyContact,
            bankAccountNumber,
            ifscCode
        } = req.body;

        // 1. Validate required fields
        if (!aadhaarNumber || !residentialAddress || !emergencyContact || !bankAccountNumber || !ifscCode) {
            return res.status(400).json({ success: false, error: 'Please provide all required onboarding information.' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // 2. Update User Details
        user.aadhaarNumber = aadhaarNumber;
        user.residentialAddress = residentialAddress;

        // Parse emergencyContact if it's sent as a string (FormData treats objects as strings/blobs sometimes)
        if (typeof emergencyContact === 'string') {
            try {
                user.emergencyContact = JSON.parse(emergencyContact);
            } catch (err) {
                console.error("Failed to parse emergencyContact", err);
            }
        } else {
            user.emergencyContact = emergencyContact;
        }

        user.bankDetails = {
            accountNumber: bankAccountNumber,
            ifscCode: ifscCode
            // bankName can be added if available in req.body
        };

        // 3. Handle File Uploads
        if (req.files) {
            user.documents = user.documents || [];

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

            if (req.files.profilePhoto) {
                user.profileImage = `/uploads/profile-images/${req.files.profilePhoto[0].filename}`;
                user.profilePhoto = user.profileImage; // Legacy
            }
            if (req.files.aadhaarPhoto) {
                upsertDoc('AADHAAR', req.files.aadhaarPhoto[0]);
                user.aadhaarPhoto = `/uploads/documents/${req.files.aadhaarPhoto[0].filename}`;
            }

            console.log("One-shot Onboarding Documents Saved:", user.documents);
        }

        user.onboardingCompleted = true;
        user.status = 'ACTIVE';

        await user.save();

        res.status(200).json({
            success: true,
            message: 'Onboarding completed successfully',
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error completing onboarding' });
    }
};
