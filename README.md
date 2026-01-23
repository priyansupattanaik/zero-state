# ZERO STATE

![Zero State Cover](cover.png)

> **A serverless, decentralized browser-based mesh messenger featuring end-to-end encrypted text, voice, and media communication with location-aware channeling.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%23007ACC.svg)](https://www.typescriptlang.org/)
[![Nostr](https://img.shields.io/badge/protocol-Nostr-purple.svg)](https://github.com/nostr-protocol/nostr)

---

## 📖 About The Project

**Zero State** is a sovereign communication tool designed to operate entirely in the browser without reliance on central servers, databases, or user accounts.

It uses the **Nostr protocol** as a decentralized signaling layer to create an ephemeral, encrypted mesh network. Users can broadcast globally or discover local peers using **geohashed location channels**, all while retaining complete control over their identity and data.

### Core Philosophy

- **Zero Infrastructure:** No backend servers to maintain or pay for.
- **Zero Knowledge:** The transport layer (relays) cannot read private messages.
- **Sovereign Identity:** Your private key is your account. You own it completely.
- **Ephemeral by Design:** Messages are auto-pruned locally after 24 hours.

## ✨ Features

- **🌐 Decentralized Signaling:** Routes packets via the Nostr relay mesh (Damus, Primal, etc.).
- **🔒 End-to-End Encryption (E2EE):** Direct messages and media are secured using **Curve25519** (TweetNaCl).
- **📍 Location-Aware Channels:** GPS Geohashing places you in a local "room" (approx. 5km radius) to find nearby peers without revealing exact coords.
- **📸 Rich Media:** Send compressed images and captured voice notes securely over the mesh.
- **🧹 Auto-Retention:** Built-in "Garbage Collector" automatically deletes local messages older than 24 hours to preserve privacy and storage.
- **💾 Offline-First:** Identity and history are persisted in **IndexedDB**, ensuring data survives reloads until pruned.
- **📱 Neo-Terminal UI:** A responsive, mobile-first interface with distinct "Public" (Green) and "Secure" (Magenta) visual themes.

## 🛠️ Architecture

Zero State runs entirely client-side:

1.  **UI Layer (React/Vite):** "Neo-Terminal" interface handling user input and media capture.
2.  **Application Kernel:** Manages state, command parsing, and service coordination.
3.  **Crypto Service:** Handles Curve25519 keypair management and encryption/decryption.
4.  **Protocol Layer:** Serializes data into compact binary packets (`Buffer`) for efficient transport.
5.  **Signaling Layer:** Wraps packets in Nostr events (Kind 1) and broadcasts to public relays.
6.  **Storage Layer:** IDB wrapper that persists encrypted data and handles the 24h auto-pruning logic.

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+)
- npm

### Installation

1.  Clone the repository:

    ```bash
    git clone [https://github.com/priyansupattanaik/zero-state.git](https://github.com/priyansupattanaik/zero-state.git)
    cd zero-state
    ```

2.  Install dependencies:

    ```bash
    npm install
    ```

3.  Start the development server:

    ```bash
    npm run dev
    ```

4.  Open `http://localhost:5173`.

## 🕹️ Usage & Commands

### Interface Guide

- **Public Mode (Green):** Messages are broadcast to everyone on your current Frequency (Global or Local).
- **Secure Mode (Magenta):** Click a User ID (e.g., `[8F2A...]`) to lock into an E2EE channel. The UI changes color to indicate encryption is active.
- **GPS Button:** Switches your Frequency to your local Geohash (e.g., `FREQ: DP3W2`).

### Terminal Commands

Type these into the message input:

| Command        | Description                                                                                             |
| :------------- | :------------------------------------------------------------------------------------------------------ |
| `/join <room>` | Manually switch to a custom topic (e.g., `/join cyberpunk`).                                            |
| `/key`         | Reveal your Private Key for backup. **Keep this secret.**                                               |
| `/login <key>` | Restore an identity from a private key.                                                                 |
| `/nuke`        | **Emergency Wipe.** Instantly deletes all local data, keys, and history, then reloads a fresh identity. |
| `/help`        | List available commands.                                                                                |

## 📦 Tech Stack

- [React](https://reactjs.org/) + [Vite](https://vitejs.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Nostr-Tools](https://github.com/nbd-wtf/nostr-tools) (Signaling)
- [TweetNaCl.js](https://tweetnacl.js.org/) (Cryptography)
- [idb](https://github.com/jakearchibald/idb) (Storage)
- [Lucide React](https://lucide.dev/) (Icons)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
