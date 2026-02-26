const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please add a name']
    },
    email: {
        type: String,
        required: [true, 'Please add an email'],
        unique: true,
        match: [
            /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
            'Please add a valid email'
        ]
    },
    password: {
        type: String,
        minlength: 6,
        select: false
    },
    role: {
        type: String,
        enum: ['EMPLOYEE', 'ADMIN', 'HR', 'MANAGER', 'TEAM_LEADER'],
        default: 'EMPLOYEE'
    },
    status: {
        type: String,
        enum: ['INVITED', 'ONBOARDING', 'ACTIVE', 'DEACTIVATED'],
        default: 'INVITED'
    },
    onboardingStep: {
        type: Number,
        default: 1
    },
    onboardingStatus: {
        type: String,
        enum: ['PENDING', 'COMPLETED', 'N/A'],
        default: 'PENDING'
    },
    onboardingCompleted: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true
    },
    inviteToken: {
        type: String,
        select: false
    },
    inviteTokenExpiry: Date,
    lastReminderSentAt: Date,
    emailHistory: [{
        emailType: {
            type: String,
            required: true
        },
        sentAt: {
            type: Date,
            default: Date.now
        },
        smtpResponse: String,
        status: {
            type: String,
            enum: ['SUCCESS', 'FAILED'],
            default: 'SUCCESS'
        }
    }],
    otp: String,
    otpExpires: Date,
    branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch'
    },
    shift: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shift'
    },
    lateCount: {
        type: Number,
        default: 0
    },
    earlyExitCount: {
        type: Number,
        default: 0
    },
    availableLeaves: {
        type: Number,
        default: 0 // Will be populated for post-probation
    },
    leavesTaken: {
        type: Number,
        default: 0
    },
    probationLeavesAllocated: {
        type: Boolean,
        default: false
    },
    joiningDate: {
        type: Date,
        default: Date.now
    },
    probationEndDate: {
        type: Date // Calculated as joiningDate + 6 months
    },
    resignationDate: {
        type: Date // For mid-month exit proration
    },
    probationStatus: {
        type: String,
        enum: ['ON_PROBATION', 'POST_PROBATION'],
        default: 'ON_PROBATION'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    welcomeEmailSent: {
        type: Boolean,
        default: false
    },
    pfAccountNumber: {
        type: String,
        validate: {
            validator: function (v) {
                return !v || /^\d{12}$/.test(v);
            },
            message: 'PF Account Number must be exactly 12 digits'
        }
    },
    isPfEligible: {
        type: Boolean,
        default: false
    },
    uanNumber: {
        type: String,
        trim: true
    },
    monthlyCTC: {
        type: Number,
        default: 0
    },
    profileImage: {
        type: String,
        default: ''
    },
    aadhaarNumber: {
        type: String,
        trim: true,
        validate: {
            validator: function (v) {
                return !v || /^\d{12}$/.test(v);
            },
            message: 'Aadhaar Number must be exactly 12 digits'
        }
    },
    panNumber: {
        type: String,
        trim: true,
        uppercase: true
    },
    dateOfBirth: {
        type: Date
    },
    gender: {
        type: String,
        enum: ['Male', 'Female', 'Other']
    },
    phoneNumber: {
        type: String,
        trim: true
    },
    address: {
        line1: String,
        line2: String,
        city: String,
        state: String,
        pincode: String
    },
    emergencyContact: {
        name: String,
        relation: String,
        phone: String
    },
    bankDetails: {
        accountHolderName: String,
        accountNumber: String,
        ifscCode: String,
        bankName: String
    },
    documents: [
        {
            type: {
                type: String,
                enum: ['AADHAAR', 'PAN', 'BANK_PROOF', 'EDUCATION', 'LICENCE', 'OTHER']
            },
            fileUrl: String,
            originalName: String,
            uploadedAt: {
                type: Date,
                default: Date.now
            }
        }
    ],
    lastLogin: Date,
    resetPasswordToken: String,
    resetPasswordExpire: Date
});

// Status lifecycle guard — only handle deactivation here
// Status transitions (ONBOARDING → ACTIVE) are handled ONLY by controllers
userSchema.pre('save', async function () {
    if (this.isActive === false && (this.status === 'ACTIVE' || this.status === 'ONBOARDING')) {
        this.status = 'DEACTIVATED';
    }
    if (this.status === 'DEACTIVATED') {
        this.isActive = false;
    }
});

userSchema.pre('save', async function () {
    if (!this.isModified('password') || !this.password) {
        return;
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// Generate and hash password reset token
userSchema.methods.getResetPasswordToken = function () {
    // Generate token
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(20).toString('hex');

    // Hash token and set to resetPasswordToken field
    this.resetPasswordToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');

    // Set expire (1 hour)
    this.resetPasswordExpire = Date.now() + 60 * 60 * 1000;

    return resetToken;
};

module.exports = mongoose.model('User', userSchema);
