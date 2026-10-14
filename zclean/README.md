# ZClean — Booking & Management System
**Z's Cleaning Services, Calbayog City**

---

## Quick Setup

### 1. Database (XAMPP/phpMyAdmin)
1. Start XAMPP → Start **Apache** and **MySQL**
2. Open phpMyAdmin at `http://localhost/phpmyadmin`
3. Click **SQL** tab (top)
4. Paste the entire contents of `database/schema.sql` and click **Go**
5. Database `zclean_db` is created with all tables and seed data

**Default admin login:**
- Email: `admin@zclean.com`
- Password: `admin123`

---

### 2. Server Setup
```bash
cd server
npm install
# Edit .env if needed (DB password, SMTP, etc.)
npm run dev
```
Server runs at: `http://localhost:5000`

---

### 3. Client Setup
```bash
cd client
npm install
npm run dev
```
Client runs at: `http://localhost:5173`

---

## Environment Variables (`server/.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | Server port |
| `DB_HOST` | `localhost` | MySQL host |
| `DB_NAME` | `zclean_db` | Database name |
| `DB_USER` | `root` | MySQL user |
| `DB_PASS` | *(empty)* | MySQL password |
| `JWT_SECRET` | `zclean_super_secret...` | Change for production |
| `SMTP_USER` | *(empty)* | Gmail address for email |
| `SMTP_PASS` | *(empty)* | Gmail App Password |

> To enable email: use a Gmail account with **2FA enabled** and create an **App Password** at myaccount.google.com/apppasswords

---

## Features

### Client (Register → Login → Book)
- Register with address (dropdown: Calbayog, Gandara, Sta. Margarita, San Jorge)
- Browse services on homepage with reviews
- Book a service: select service + add-ons, pick date/time, address, cash or GCash
- Upload GCash receipt (QR code shown from settings)
- View booking history — cancel pending, view status
- OTP-based password reset via email
- Real-time notifications (bell icon)

### Admin (admin@zclean.com / admin123)
- Dashboard: stats cards, recent bookings
- Bookings: confirm, complete, cancel, verify GCash, view receipt
- Services: add/edit/delete services with images, manage global add-ons
- Clients: view all registered clients with booking counts
- Reviews: view all reviews, reply to reviews
- Reports: monthly revenue + expenses, yearly chart, expense CRUD, block dates

---

## Project Structure
```
zclean/
├── database/schema.sql        ← Run this first in phpMyAdmin
├── server/                    ← Express.js API
│   ├── controllers/           ← Business logic
│   ├── routes/                ← API endpoints
│   ├── models/db.js           ← MySQL connection
│   ├── middleware/            ← JWT auth
│   ├── utils/                 ← Mailer, scheduler, upload
│   └── index.js              ← Entry point
└── client/                    ← React + Vite + Tailwind
    └── src/
        ├── components/        ← Shared UI components
        ├── pages/
        │   ├── client/        ← Booking, history, profile
        │   └── admin/         ← Dashboard, bookings, reports...
        ├── hooks/             ← useAuth, useDarkMode
        └── services/api.js    ← Axios API layer
```

---

## Tech Stack
| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | Express.js (Node.js) |
| Database | MySQL (XAMPP) |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| Email | Nodemailer (Gmail SMTP) |
| File Uploads | Multer |
| Scheduling | node-cron (daily reminders) |

---

*Capstone Project — Z's Cleaning Services, Calbayog City, Samar*
