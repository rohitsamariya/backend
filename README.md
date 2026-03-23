# 🏢 HRMS Backend — Enterprise HR & Attendance Management System

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-5.x-000000?style=for-the-badge&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![JWT](https://img.shields.io/badge/Auth-JWT-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)
![License](https://img.shields.io/badge/License-ISC-blue?style=for-the-badge)

> A production-ready, enterprise-grade backend for managing employees, attendance, payroll, shifts, and automated HR workflows — built for **Cortexa Global**.

</div>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [API Reference](#-api-reference)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Scripts](#-scripts)

---

## 🚀 Overview

The **HRMS Backend** is a comprehensive REST API server powering a full Human Resource Management System. It handles the complete employee lifecycle — from secure onboarding and geo-fenced attendance to automated payroll processing, PDF generation, and discipline enforcement.

The system enforces a strict **3-6-9 Violation Policy** that automatically penalises late arrivals, early exits, and missed checkouts without any manual intervention by HR.

---

## ✨ Key Features

### 👤 Employee Management
- Role-based access control: `ADMIN`, `HR`, `MANAGER`, `TL`, `EMPLOYEE`
- Secure onboarding with email OTP verification and admin approval workflow
- Branch-wise employee segmentation with manager/TL hierarchy
- Profile management with photo uploads via Multer

### 📍 Geo-Fenced Attendance
- GPS-based check-in/out with configurable radius (e.g., 20m from office)
- Multi-punch support for complex attendance scenarios
- Real-time attendance status tracking

### ⏰ Shift Management
- Flexible Day/Night shift creation with custom timings
- Automatic shift duration calculation
- Grace period and buffer time configuration per shift

### 🤖 Smart Automation (Cron Jobs)
- **Auto-Checkout**: Runs every 10 minutes — automatically closes abandoned shifts (Shift End + 2 hours)
- **Onboarding Reminders**: Daily 12:00 PM IST email reminders for pending approvals
- Background payroll email dispatch

### ⚖️ Discipline Engine (3-6-9 Policy)
| Violation | Trigger | Penalty |
|:---|:---|:---|
| Late Arrival | After shift start + grace period | Flagged |
| Early Exit | Before shift end - buffer | Flagged |
| Auto-Checkout | Shift abandoned | Flagged |
| **Penalty Rule** | Every 3 violations | **0.5 day deduction** |

### 💰 Payroll System
- Automated salary calculation based on attendance and violations
- Monthly payroll summaries with email dispatch
- PDF payslip generation via PDFKit / Puppeteer

### 📧 Email System (Hostinger SMTP)
- OTP verification emails
- Onboarding invitation emails
- Payroll summary emails
- Automated reminder notifications

---

## 🛠 Tech Stack

| Category | Technology | Version |
|:---|:---|:---|
| **Runtime** | Node.js | `>=18` |
| **Framework** | Express.js | `^5.2.1` |
| **Database** | MongoDB + Mongoose | `^9.2.1` |
| **Authentication** | JWT (jsonwebtoken) | `^9.0.3` |
| **Password Hashing** | bcryptjs | `^3.0.3` |
| **Timezone Handling** | Luxon | `^3.7.2` |
| **Scheduling** | Node-Cron | `^4.2.1` |
| **Email** | Nodemailer | `^8.0.1` |
| **PDF Generation** | PDFKit + Puppeteer | Latest |
| **File Uploads** | Multer | `^2.0.2` |
| **Security** | Helmet + Rate Limiter | Latest |

---

## 📁 Project Structure

```
backend/
├── config/             # DB connection & environment setup
├── controllers/        # Route handler logic (MVC)
├── middleware/         # Auth guards, role checks, error handlers
├── models/             # Mongoose data schemas
│   ├── User.js
│   ├── Attendance.js
│   ├── Shift.js
│   ├── Payroll.js
│   └── ...
├── routes/             # Express route definitions
├── services/           # Business logic services (email, payroll, etc.)
├── utils/              # Helper utilities
├── validations/        # Request validation schemas
├── uploads/            # Multer file storage
├── server.js           # App entry point
└── .env.example        # Environment variable template
```

---

## 📡 API Reference

| Module | Base Route | Description |
|:---|:---|:---|
| **Auth** | `/api/auth` | Register, OTP verify, login, approval status |
| **Admin** | `/api/admin` | User management, roles, dashboard stats |
| **Attendance** | `/api/attendance` | Check-in, check-out, history, reports |
| **Shifts** | `/api/shifts` | Create, update, assign shifts |
| **Payroll** | `/api/payroll` | Salary calculation, payslips, summaries |
| **Discipline** | `/api/discipline` | Violation reports, penalty tracking |
| **Leaves** | `/api/leaves` | Leave requests and approvals |
| **Branches** | `/api/branches` | Branch management |

---

## ⚡ Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) `v18+`
- [MongoDB](https://www.mongodb.com/) (Local or Atlas)
- Git

### Installation

**1. Clone the repository**
```bash
git clone https://github.com/rohitsamariya/backend.git
cd backend
```

**2. Install dependencies**
```bash
npm install
```

**3. Configure environment variables**
```bash
cp .env.example .env
# Then edit .env with your values
```

**4. Start the development server**
```bash
npm run dev
```

The server will start at `http://localhost:5000` with Nodemon hot-reload.

---

## 🔐 Environment Variables

Create a `.env` file in the root directory based on `.env.example`:

```env
# Server
PORT=5000

# Database
MONGO_URI=mongodb://127.0.0.1:27017/hrms_attendance

# Authentication
JWT_SECRET=your_super_secure_secret_key

# Email (Hostinger SMTP)
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your_password
FROM_NAME=Your Company Name

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

> ⚠️ **Never commit your `.env` file.** It is already included in `.gitignore`.

---

## 📜 Scripts

| Command | Description |
|:---|:---|
| `npm run dev` | Start in development mode with Nodemon |
| `npm start` | Start in production mode |

---

## 🏗 System Architecture

```
Client Request
      │
      ▼
  Rate Limiter + Helmet (Security)
      │
      ▼
  Express Router
      │
      ▼
  Auth Middleware (JWT Verification)
      │
      ▼
  Role Guard (RBAC)
      │
      ▼
  Controller → Service → Model (MongoDB)
      │
      ▼
  JSON Response
```

**Employee Lifecycle:**
```
Register → OTP Verify → Pending Approval → Admin Approves → Active
```

**Attendance Flow:**
```
Check-In (GPS Validated) → Work → Check-Out → Duration Calc → Violation Check → Report
```

---

<div align="center">

Made with ❤️ by [Rohit Samariya](https://github.com/rohitsamariya) · Cortexa Global

</div>