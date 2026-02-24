const cron = require('node-cron');
const User = require('../models/User');
const { sendLifecycleEmail } = require('./emailService');

/**
 * Run Daily Onboarding Reminders
 * Frequency: Every day at 10:00 AM
 */
const runOnboardingReminders = async () => {
    console.log('[ReminderService] Running daily onboarding reminders...');

    try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        // Target: Registered but not completed onboarding
        // And either never reminded or last reminded > 24h ago
        const usersToRemind = await User.find({
            status: 'ONBOARDING',
            onboardingStatus: 'PENDING',
            $or: [
                { lastReminderSentAt: { $exists: false } },
                { lastReminderSentAt: { $lt: twentyFourHoursAgo } }
            ]
        });

        console.log(`[ReminderService] Found ${usersToRemind.length} users to remind.`);

        const resumeLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/onboarding`;

        for (const user of usersToRemind) {
            try {
                const completedCount = (user.onboardingStep || 1) - 1;
                const remainingCount = 7 - completedCount;

                const { generateReminderEmail } = require('./emailTemplates/reminderTemplate');
                const html = generateReminderEmail(user.name, completedCount, remainingCount, resumeLink);

                await sendLifecycleEmail(user, 'REMINDER', 'Reminder: Complete Your Onboarding Process', html);

                // Update last reminder timestamp
                user.lastReminderSentAt = new Date();
                await user.save();

                console.log(`[ReminderService] Reminder sent to ${user.email}`);
            } catch (err) {
                console.error(`[ReminderService] Failed to send reminder to ${user.email}:`, err);
            }
        }

    } catch (error) {
        console.error('[ReminderService] Error in reminder job:', error);
    }
};

/**
 * Initialize Scheduler
 */
const initReminderCron = () => {
    // 30 6 * * * = 06:30 AM UTC which is 12:00 PM IST
    cron.schedule('30 6 * * *', runOnboardingReminders);
    console.log('[ReminderService] Onboarding reminder cron initialized (12:00 PM IST Daily).');
};

module.exports = { initReminderCron, runOnboardingReminders };
