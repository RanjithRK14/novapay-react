# NovaPay — Next-Gen Digital Payments

A full-stack digital payment frontend built with **React + Vite**, designed to connect to a **Spring Boot microservices** backend.

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18+ installed
- VS Code (recommended)

### Installation & Run

```bash
# 1. Install dependencies
npm install

# 2. Start development server
npm run dev
```

Then open **http://localhost:5173** in your browser.

---

## 🔌 Connect to Your Spring Boot Backend

Open `src/App.jsx` and update line 9:

```js
const API_BASE = "http://localhost:8080"; // Your Spring Boot API Gateway
```

### Enable CORS in Spring Boot (API Gateway)

Add this bean to your Spring Boot configuration:

```java
@Bean
public CorsWebFilter corsFilter() {
    CorsConfiguration config = new CorsConfiguration();
    config.addAllowedOrigin("http://localhost:5173");
    config.addAllowedMethod("*");
    config.addAllowedHeader("*");
    config.setAllowCredentials(true);
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", config);
    return new CorsWebFilter(source);
}
```

---

## 📁 Project Structure

```
novapay/
├── public/
│   └── favicon.svg          # NovaPay logo favicon
├── src/
│   ├── App.jsx              # Full application (Landing + Auth + Dashboard)
│   └── main.jsx             # React entry point
├── index.html               # HTML template
├── vite.config.js           # Vite configuration
├── package.json             # Dependencies
└── README.md                # This file
```

---

## 🎯 Pages & Features

| Page | Features |
|------|----------|
| **Landing** | Hero, Stats, Features, How It Works, Testimonials, FAQ, CTA |
| **Auth** | Sign In / Register with JWT |
| **Dashboard** | Balance overview, recent transactions, stats |
| **Wallet** | Add funds, withdraw, transaction history |
| **Send Money** | 3-step transfer flow with quick contacts |
| **Rewards** | Tier progress, points history, cashback |
| **Notifications** | Real-time alerts, mark as read |
| **Profile** | Edit info, security settings |

---

## 🛠 Backend API Endpoints Expected

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Login with email & password |
| POST | `/auth/register` | Register new user |
| GET | `/wallet/balance` | Get wallet balance |
| GET | `/wallet/transactions` | Get transaction history |
| POST | `/wallet/transfer` | Send money |
| POST | `/wallet/deposit` | Add funds |
| POST | `/wallet/withdraw` | Withdraw funds |
| GET | `/rewards/points` | Get reward points |
| GET | `/rewards/history` | Get reward history |
| GET | `/notifications` | Get notifications |
| PUT | `/notifications/:id/read` | Mark notification as read |

---

## 📝 Notes

- App runs in **demo mode** with mock data when backend is offline
- Any email/password works in demo mode
- Built with Vite for fast HMR during development

---

## 🏗 Build for Production

```bash
npm run build
```

Output will be in the `dist/` folder.
"# novapay-react" 
