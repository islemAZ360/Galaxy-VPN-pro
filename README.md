<div align="center">

  <img src="https://raw.githubusercontent.com/islemAZ360/Galaxy-VPN-pro/main/public/hacker_interface.svg" alt="GalaxyVPN Radar Terminal" width="100%" />

  <br/>

  <a href="https://git.io/typing-svg">
    <img src="https://readme-typing-svg.herokuapp.com?font=Fira+Code&weight=700&size=24&pause=1000&color=00FFFF&center=true&vCenter=true&width=600&lines=The+Ultimate+VPN+Subscription+Engine;Bypass+Deep+Packet+Inspection+Easily;Fully+Automated+Server+Testing;Enterprise-Grade+Billing+%26+Analytics" alt="Typing SVG" />
  </a>

  <br/><br/>

  [![Next.js](https://img.shields.io/badge/Next.js_15-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Tailwind](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
  [![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
  
</div>

<img src="https://raw.githubusercontent.com/islemAZ360/Galaxy-VPN-pro/main/public/neon_separator.svg" width="100%" />

<div align="center">
  <p>
    <b>GalaxyVPN Pro</b> is not just a VPN app, it is a fully autonomous <b>ecosystem</b>. It automatically hunts for live servers, tests their latency across multiple network tiers, provisions access, handles billing, and provides enterprise-grade analytics.
  </p>
</div>

<img src="https://raw.githubusercontent.com/islemAZ360/Galaxy-VPN-pro/main/public/neon_separator.svg" width="100%" />

## ✨ Supernatural Features

<table style="width: 100%; border-collapse: collapse;">
<tr>
<td width="50%" valign="top">
  <h3>🚀 Warp-Speed VLESS</h3>
  <p>Built specifically to shatter the strictest DPI (Deep Packet Inspection) blocks. Next-generation VLESS & Reality protocols ensure invisible, high-speed routing.</p>
</td>
<td width="50%" valign="top">
  <h3>🤖 Autonomous Testing</h3>
  <p>A relentless background Node.js worker continuously fetches configs from GitHub, tests them in real-time (ping, reachability), and categorizes them by network type.</p>
</td>
</tr>
<tr>
<td width="50%" valign="top">
  <h3>💳 Smart Billing Engine</h3>
  <p>End-to-end subscription management. Users upload receipts, admins approve via the dashboard, and time-locks automatically grant or revoke server access.</p>
</td>
<td width="50%" valign="top">
  <h3>📊 Enterprise Analytics</h3>
  <p>A breathtaking admin dashboard tracking MRR (Monthly Recurring Revenue), ARPU (Average Revenue Per User), daily sales, and real-time server health distribution.</p>
</td>
</tr>
</table>

<br/>

<div align="center">
  <img src="https://raw.githubusercontent.com/islemAZ360/Galaxy-VPN-pro/main/public/vpn_tunnel.svg" alt="Animated VPN Encrypted Tunnel" width="100%" />
</div>

<br/>

## 🪐 Ecosystem Architecture

GalaxyVPN is built on a distributed, highly-scalable architecture:

```mermaid
graph TD;
    %% Styling
    classDef web fill:#000000,stroke:#38B2AC,stroke-width:2px,color:#fff;
    classDef worker fill:#1E1E1E,stroke:#F59E0B,stroke-width:2px,color:#fff;
    classDef db fill:#1C2E2A,stroke:#3ECF8E,stroke-width:2px,color:#fff;
    classDef ext fill:#0D1117,stroke:#58A6FF,stroke-width:2px,color:#fff;

    User((👤 Client)) -->|Buys & Connects| Web
    Admin((👑 Admin)) -->|Manages| Web
    
    Web[🌌 Next.js Web Platform]:::web <-->|Auth & Data| DB[(🗄️ Supabase)]:::db
    
    Worker[🤖 Tester Worker]:::worker -->|Updates Alive Nodes| DB
    Worker -->|Scrapes Configs| GitHub[🐙 GitHub Repos]:::ext
    Worker -->|Pings & Tests| Servers[⚡ VPN Servers]:::ext
    
    Admin -->|Pushes Servers| Hiddify[📱 Hiddify App]:::ext
    Hiddify -->|Syncs| GitHub
```

<br/>

## 🛰️ Mission Control (Quick Start)

<details>
<summary><b>1️⃣ System Prerequisites</b> <i>(Click to expand)</i></summary>
<br/>

- Node.js 20+
- A Supabase Project
- Google Cloud Console Project (for OAuth)

</details>

<details>
<summary><b>2️⃣ Lift-Off (Installation)</b> <i>(Click to expand)</i></summary>
<br/>

Clone the repository and install the required dependencies:
```bash
git clone https://github.com/islemAZ360/Galaxy-VPN-pro.git
cd Galaxy-VPN-pro
npm install
```

</details>

<details>
<summary><b>3️⃣ Core Ignition (Environment)</b> <i>(Click to expand)</i></summary>
<br/>

Copy the example environment file and fill in your keys:
```bash
cp .env.example .env.local
```
*(See `SETUP.md` for detailed configuration).*

</details>

<details>
<summary><b>4️⃣ Database Sync</b> <i>(Click to expand)</i></summary>
<br/>

Run the SQL schema located in `supabase/schema.sql` in your Supabase SQL Editor. This sets up all necessary tables, RLS policies, and triggers.

</details>

<details>
<summary><b>5️⃣ Launch Server</b> <i>(Click to expand)</i></summary>
<br/>

Start the development server:
```bash
npm run dev
```
Visit `http://localhost:3000` to enter the Galaxy.

</details>

<br/>

## 🌠 Deployment

Deploying the GalaxyVPN ecosystem is streamlined via a Render Blueprint. 

1. Simply connect your GitHub repository to Render.
2. Use the included `render.yaml` file to spin up both the **Web Service** and the **Background Worker** simultaneously.
3. Configure your environment secrets in the dashboard.

---

<div align="center">
  <img src="https://img.shields.io/badge/Made%20for-Freedom-blueviolet?style=for-the-badge" alt="Made for Freedom" />
  <br/><br/>
  <i>Crafted with ❤️ and code to keep the internet open and free.</i>
</div>
