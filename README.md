# Hyperswarm DHT & RPC Server

## Overview

This project implements a **decentralized server** using **Hyperswarm, HyperDHT, and Hyperbee** to fetch and store cryptocurrency price data. The system allows clients to connect via **DHT and Hyperswarm** to request the latest and historical prices.

## Features Implemented

✅ Connected clients to the server using **Hyperswarm & DHT**.
✅ Established **data storage** using **Hypercore & Hyperbee**.
✅ Implemented **periodic price fetching** using **cron jobs**.
✅ Supported **retrieval of historical prices**.
✅ Data encrytpion and signing **using ECDH key pair, AES-256-GCM, ECDSA**.
✅ Connected clients to the server using **Hyperswarm RPC**.

### Features Not Yet Achieved

❌ Set up **request rate limiting** per client.
❌ Ran **automated tests** to verify functionality.
❌ Cache **using redis**

---

## Installation & Setup

### 1️⃣ Install Dependencies

Ensure you have **Node.js (>=16.x.x)** installed, then run:

```sh
npm install
```

### 2️⃣ Start the Server

To run the Hyperswarm-based server:

```sh
npm run server
```

### 3️⃣ Start the Client

To connect a client to the server:

```sh
npm run client
```

---

## How We Would Achieve the Missing Features

### **Hyperswarm RPC Connection**

To properly implement **Hyperswarm RPC**, we would:

### **Request Rate Limiting**

To prevent abuse and ensure fair resource distribution, we would:

1. Maintain a record of requests per client using an in-memory store (e.g., a **Map** or **Redis** for persistence).
2. Set limits (e.g., **5 requests per minute per client**).
3. Reject requests exceeding the limit with an error message.

### **Automated Tests**

To verify the implementation, we would:

1. Use **Jest** or **Mocha/Chai** to write test cases.
2. Test key functionalities:
   - Server startup and client connection.
   - Fetching and storing cryptocurrency prices.
   - Rate limiting enforcement.
   - RPC method responses.
3. Run tests via:

```sh
npm test
```

---

Prince randy
