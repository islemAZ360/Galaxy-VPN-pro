<div align="center">
  <img src="public/favicon.ico" alt="GalaxyVPN Logo" width="120" />

  # 🌌 GalaxyVPN Pro

  **The ultimate, censorship-resistant VPN subscription platform.**

  [![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
  [![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
  
  <br />
</div>

## ✨ Features

- **🚀 Lightning Fast VLESS/Reality:** Built specifically for speed and to bypass severe DPI (Deep Packet Inspection) blocks.
- **🤖 Automated Server Testing:** A background worker constantly tests servers for liveness, latency, and connectivity (Wi-Fi, LTE, Gemini).
- **💳 Built-in Billing System:** Support for manual payments (Sber Bank), admin approval, and automated subscriptions.
- **🌐 Tri-lingual:** Full native support for English, Arabic, and Russian (via `next-intl`).
- **📊 Advanced Admin Dashboard:** Manage users, payments, GitHub repos (for servers), and view rich analytics.

---

## 🏗️ Architecture

GalaxyVPN consists of three main components:

| Component | Description |
|-----------|-------------|
| 🌐 **Web App** (`galaxyvpn/`) | The main **Next.js** platform handling landing pages, user profiles, payments, and the admin dashboard. |
| 🛠️ **Worker** (`galaxyvpn/worker/`) | A Node.js background process that fetches VPN configs from GitHub repos, tests their ping/connectivity, and syncs them to Supabase. |
| 📱 **Client App** (`../hiddify/`) | A modified Hiddify app used as an admin tool to push server configs to GitHub repositories. |

---

## 🛠️ Tech Stack

- **Frontend:** Next.js 15 (App Router), React, Tailwind CSS, Lucide Icons, Recharts
- **Backend:** Supabase (PostgreSQL, Auth, Realtime, Edge Functions)
- **Localization:** `next-intl`
- **Testing Engine:** `xray-knife`

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js 20+
- A Supabase Project
- A Google Cloud Console project (for OAuth)

### 2. Installation

Clone the repository and install dependencies:
```bash
git clone https://github.com/islemAZ360/Galaxy-VPN-pro.git
cd Galaxy-VPN-pro
npm install
```

### 3. Environment Setup

Copy the example env file:
```bash
cp .env.example .env.local
```
Fill in the keys (See [`SETUP.md`](SETUP.md) for detailed Supabase + Google OAuth configuration).

### 4. Database Setup

Run the SQL schema located in [`supabase/schema.sql`](supabase/schema.sql) in your Supabase SQL Editor. This sets up all tables, RLS policies, and triggers.

### 5. Run Locally

Start the development server:
```bash
npm run dev
```
Visit `http://localhost:3000` to see the app.

---

## 📦 Deployment

This project includes a Render Blueprint. You can easily deploy the web app and the background worker by connecting your repository to Render:

1. Use the `render.yaml` file.
2. Set your environment variables in the Render dashboard.

---

<div align="center">
  <i>Built with ❤️ for a free and open internet.</i>
</div>
