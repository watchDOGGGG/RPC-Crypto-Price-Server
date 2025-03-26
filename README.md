# Hyperswarm DHT & RPC Crypto Price Server

## Overview

This project implements a **decentralized server** using **Hyperswarm, HyperDHT, and Hyperbee** to fetch and store cryptocurrency price data. The system allows clients to connect via **DHT and Hyperswarm RPC** to request the latest and historical prices.

## Features Implemented

✅ Connected clients to the server using **Hyperswarm & DHT**.
✅ Established **data storage** using **Hypercore & Hyperbee**.
✅ Implemented **periodic price fetching** using **cron jobs**.
✅ Supported **retrieval of historical prices**.
✅ Data encryption and signing **using ECDH key pair, AES-256-GCM, and ECDSA**.
✅ Connected clients to the server using **Hyperswarm RPC**.

### Features Not Yet Achieved

❌ Set up **request rate limiting** per client.
❌ Ran **automated tests** to verify functionality.
❌ Implemented **caching using Redis**.

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

Current implementation requries you to copy key from log and paste in the client:
best practise was to store the key in the hyperbee storage, i had errors and due to time i could not debug real quick

---

## Notes on Connectivity

Due to **firewall issues and time constraints**, I was unable to connect to my local instance, so I had to use **public HyperDHT bootstrap nodes** instead. Below are the bootstrap nodes used:

```js
const BOOTSTRAP_NODES = [
  "88.99.3.86@node1.hyperdht.org:49737",
  "142.93.90.113@node2.hyperdht.org:49737",
  "138.68.147.8@node3.hyperdht.org:49737",
];
```

These are **public HyperDHT bootstrap nodes** that help peers discover each other and connect within the distributed network.

---

## How We Would Achieve the Missing Features

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

## Author

Prince Randy
