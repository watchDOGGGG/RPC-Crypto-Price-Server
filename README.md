# Hyperswarm DHT & RPC Server

## Overview

This project implements a **decentralized server** using **Hyperswarm, HyperDHT, and Hyperbee** to fetch and store cryptocurrency price data. The system allows clients to connect via **DHT and Hyperswarm** to request the latest and historical prices.

## Features Implemented

✅ Connected clients to the server using **Hyperswarm & DHT**.
✅ Established **data storage** using **Hypercore & Hyperbee**.
✅ Implemented **periodic price fetching** using **cron jobs**.
✅ Supported **retrieval of historical prices**.

## Features Not Achieved

❌ Connected clients to the server using **Hyperswarm RPC**.
❌ Set up **request rate limiting** per client.
❌ Ran **automated tests** to verify functionality.

## Due to time, hopefully we would have implemented it within an additional 1 hour

## Installation & Setup

### 1️⃣ Install Dependencies

Ensure you have **Node.js (>=16.x.x)** installed, then run:

```sh
npm install
```

### 2️⃣ Start the Server

To run the Hyperswarm-based server:

```sh
node server.js
```

### 3️⃣ Start the Client

To connect a client to the server:

```sh
node client.js
```

---

## Usage

- The server fetches the **top 5 cryptocurrency prices** against **USDt** every **30 seconds**.
- Clients can request:
  - **Latest Prices**
  - **Historical Prices** (by providing a time range)

---

## Next Steps

We plan to implement the following missing features:

- **Integrating Hyperswarm RPC for client-server communication**.
- **Setting up request rate limiting per client**.
- **Running automated tests to verify system functionality**.

Prince randy
