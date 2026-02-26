const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const connectDB = require('./config/db');

// 1. Environment Handling
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
} else {
    // Security Hardening: Ensure required configs are present in production
    const requiredEnv = ['JWT_SECRET', 'MONGO_URI', 'SMTP_USER', 'SMTP_PASS'];
    const missingEnv = requiredEnv.filter(key => !process.env[key]);
    if (missingEnv.length > 0) {
        console.error(`FATAL ERROR: Missing required environment variables: ${missingEnv.join(', ')}`);
        process.exit(1);
    }
}

// 2. Connect to Database
connectDB();

// 3. Start Schedulers
const { startScheduler } = require('./services/autoCheckoutService');
const { runMonthlyPayroll } = require('./services/autoPayrollService');
const { initReminderCron } = require('./services/reminderService');
const cron = require('node-cron');

startScheduler();
initReminderCron();

// Monthly Payroll Batch (1st of Month at 2:00 AM)
cron.schedule('0 2 1 * *', () => {
    if (process.env.NODE_ENV !== 'production') {
        console.log('Running Monthly Payroll Batch...');
    }
    runMonthlyPayroll(new Date());
});

const app = express();

// 4. Performance & Security Middleware
app.set('trust proxy', 1); // Enable if behind a reverse proxy (like Render)
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(express.json());

// Enable rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // limit each IP to 1000 requests per windowMs
    message: 'Too many requests from this IP, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);

// CORS Configuration
const allowedOrigins = [
    'http://localhost:5173',
    process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        // allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // Relax strict locally
        if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
            return callback(null, true);
        }

        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true
}));

// Static Files
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 5. Routes
app.get('/', (req, res) => {
    res.send('HRMS API is running...');
});

app.use('/api/branch', require('./routes/branchRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/onboarding', require('./routes/onboardingRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/shifts', require('./routes/shiftRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/discipline', require('./routes/disciplineRoutes'));
app.use('/api/employee', require('./routes/employeeRoutes'));
app.use('/api/manager', require('./routes/managerRoutes'));
app.use('/api/payroll', require('./routes/payrollRoutes'));
app.use('/api/hr', require('./routes/hrRoutes'));
app.use('/api/holidays', require('./routes/holidayRoutes'));

// Test Route
const { protect } = require('./middleware/authMiddleware');
const { protectActiveOnly } = require('./middleware/statusMiddleware');

app.get('/api/test/protected', protect, protectActiveOnly, (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Protected route accessed',
        user: { id: req.user._id, role: req.user.role } // Minimal log
    });
});

// 6. Error Handling Middleware
app.use((err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    if (process.env.NODE_ENV !== 'production') {
        console.error(err.stack);
    }
    res.status(statusCode).json({
        success: false,
        message: err.message,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
});

// 7. Server Boot with Graceful Shutdown
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
    if (process.env.NODE_ENV !== 'production') {
        console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
    }
});

process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        require('mongoose').connection.close(false, () => {
            console.log('MongoDB connection closed');
            process.exit(0);
        });
    });
});
