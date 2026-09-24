# CarePoint Clinic: Appointment & Queue Manager (PS 03)

A clinic management system with online appointment booking, live queue tracking and a staff dashboard.
**Stack:** React 18 (HTML, CSS, JavaScript/JSX) frontend, Java 17+ backend (JDK `HttpServer`, no external libraries).

## Problem
Walk-in clinics suffer from chaotic waiting rooms, double-booked doctors and unpredictable queues. Without a chronological flow, clinics run inefficiently and patients get frustrated. Patients need to book without conflicts, and staff need one clear queue to manage.

## Solution
- **Patients** pick a doctor, date and a free slot, get a booking ID, and follow their status and estimated wait live.
- **Staff** sign in to a dashboard that shows today's queue sorted by time and move each patient through a strict flow: `Scheduled -> Waiting -> In Consult -> Completed`.
- **The server enforces the rules**, so two patients can never hold the same slot and statuses cannot skip a step.

## Features
- Patient portal: doctor profiles (experience, qualification, fee), 7-day date picker, live slot grid, booking, booking ID tracking
- Live status view for patients (refreshes every 3 seconds) with queue position and estimated wait time
- Slot overlap prevention (server returns 409 if a slot is taken; taken slots are disabled in the UI)
- Staff login, today's queue with doctor filter and live counts, check-in, start and complete consultations
- Prescription/notes on completed appointments (visible to the patient, editable by staff)
- Staff can cancel and reschedule appointments
- Chatbot ("Ask CarePoint"): doctors, free slots today, fees, hours, booking help and queue status from a booking ID

## Setup
Requirements: JDK 17+ and an internet connection (React and Babel load from a CDN).

```
Mac/Linux:  ./run.sh
Windows:    run.bat
```
Then open **http://localhost:8080**. Java serves both the API and the React app.

Manual run: `javac -d out backend/Main.java && java -Dweb=frontend -cp out Main`

**Staff login:** `admin` / `clinic123` or `reception` / `reception123`. Change the first with the `STAFF_USER` and `STAFF_PASS` environment variables.
Delete the `data/` folder to reset to the demo data.

## Major components
| Path | Purpose |
|---|---|
| `backend/Main.java` | REST API, slot and status rules, wait-time calculation, staff login (hashed passwords, expiring tokens), JSON file persistence, static file server |
| `frontend/index.html` | Loads React, ReactDOM and Babel from the CDN |
| `frontend/app.jsx` | Patient portal, staff dashboard, login, live tracker, slot picker, chatbot |
| `frontend/styles.css` | Styling and responsive layout |
| `data/clinic.json` | Saved appointments (created on first run) |

## How the wait time is calculated
Patients ahead of you (same doctor and day, earlier slot, status Waiting or In Consult) multiplied by the 20-minute slot length.

## API
| Endpoint | Access |
|---|---|
| `GET /api/doctors`, `GET /api/doctors/{id}/slots?date=` | Public |
| `POST /api/appointments`, `GET /api/appointments/{id}` | Public |
| `POST /api/login` | Public |
| `GET /api/queue?doctorId=` | Staff |
| `POST /api/appointments/{id}/status`, `/cancel`, `/reschedule` | Staff |
| `PUT /api/appointments/{id}/notes` | Staff |

## Notes
- Data is stored in a JSON file, not a SQL database. It can be swapped for SQLite or MySQL through the small `load()`/`save()` layer.
- The clinic address, phone and email are sample details.
