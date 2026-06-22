<div align="center">
  <img src="https://raw.githubusercontent.com/islemAZ360/Galaxy-VPN-pro/main/public/icon-192x192.png" alt="GalaxyVPN Logo" width="120" />

  # 🌌 GalaxyVPN Pro
  
  **The ultimate, censorship-resistant VPN subscription platform.**
  
  <br />

  [![Next.js](https://img.shields.io/badge/Next.js_15-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
  [![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)

  <br />
</div>

> **GalaxyVPN Pro** is a modern, full-stack platform designed to manage and sell VPN subscriptions efficiently. Built with the latest technologies, it features an automated server testing engine, a built-in billing system, and a comprehensive admin dashboard.

---

## 🚀 Key Features

*   ⚡ **Lightning Fast VLESS/Reality:** Built specifically for speed and to bypass severe DPI (Deep Packet Inspection) blocks.
*   🤖 **Automated Server Testing:** A background worker constantly tests servers for liveness, latency, and connectivity (Wi-Fi, LTE, Gemini).
*   💳 **Built-in Billing System:** Support for manual payments (Sber Bank), admin approval, and automated subscriptions.
*   🌍 **Tri-lingual Support:** Full native support for English, Arabic, and Russian.
*   📊 **Advanced Admin Dashboard:** Manage users, payments, GitHub repos (for servers), and view rich analytics including MRR and ARPU.

<br />

## 🏗️ Architecture

The platform is designed with a robust and scalable architecture, divided into three main components:

| Component | Description |
| :--- | :--- |
| 🌐 **Web App** (`galaxyvpn/`) | The main **Next.js** platform handling landing pages, user profiles, payments, and the admin dashboard. |
| 🛠️ **Worker** (`galaxyvpn/worker/`) | A Node.js background process that fetches VPN configs from GitHub repos, tests their ping/connectivity, and syncs them to Supabase. |
| 📱 **Client App** (`../hiddify/`) | A modified Hiddify app used as an admin tool to push server configs to GitHub repositories. |

<br />

## 💻 Tech Stack

We utilize a modern and powerful technology stack to ensure performance and reliability:

*   **Frontend:** Next.js 15 (App Router), React, Tailwind CSS, Lucide Icons, Recharts
*   **Backend:** Supabase (PostgreSQL, Auth, Realtime, Edge Functions)
*   **Localization:** `next-intl`
*   **Testing Engine:** `xray-knife`

<br />

## 🛠️ Quick Start

Follow these steps to get a local development environment up and running.

### 1️⃣ Prerequisites
*   Node.js 20+
*   A Supabase Project
*   A Google Cloud Console project (for OAuth)

### 2️⃣ Installation
Clone the repository and install the required dependencies:
```bash
git clone https://github.com/islemAZ360/Galaxy-VPN-pro.git
cd Galaxy-VPN-pro
npm install
```

### 3️⃣ Environment Setup
Copy the example environment file and fill in your keys:
```bash
cp .env.example .env.local
```
*(See `SETUP.md` for detailed Supabase + Google OAuth configuration).*

### 4️⃣ Database Setup
Run the SQL schema located in `supabase/schema.sql` in your Supabase SQL Editor. This sets up all necessary tables, RLS policies, and triggers.

### 5️⃣ Run Locally
Start the development server:
```bash
npm run dev
```
Visit `http://localhost:3000` in your browser to see the app in action!

<br />

## ☁️ Deployment

This project includes a Render Blueprint, making deployment a breeze. You can easily deploy the web app and the background worker by connecting your repository to Render:

1.  Use the `render.yaml` file.
2.  Set your environment variables in the Render dashboard.

---

<div align="center">
  <i>Built with ❤️ for a free and open internet.</i>
</div>
