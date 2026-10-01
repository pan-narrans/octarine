# ADR 0005: Local-First Multi-Platform Runtime and E2EE Peer-to-Peer Sync

## Status

Approved (v1.0 Baseline & v2.0 Sync Expansion)

## Implementation Status

Partial. The Tauri/React desktop baseline exists. Mobile, browser, CRDT, libp2p, E2EE, device trust, filtering, relay, and merge-review capabilities are not implemented and remain roadmap work.

## Context

To eliminate throw-away code and establish maximum runtime performance immediately, we have pivoted to **Tauri (Rust Core)** as the architectural core of **v1.0 Desktop**. As we look ahead, we require seamless synchronization across multiple expanded clients in **v2.0** (macOS, Linux, Windows, iOS, Android, Web, and self-hosted server nodes) without sacrificing data privacy or locking users into proprietary cloud environments.

Key product requirements include:

1.  **Multi-Platform Ubiquity:** True native execution across desktop and mobile, as well as the ability to self-host the application inside Docker or access it via a web browser.
2.  **Peer-to-Peer (P2P) Synchronization:** Direct device-to-device synchronization over local and wide networks.
3.  **End-to-End Encryption (E2EE):** Total privacy where no third-party coordinator or relay can read the vault data.
4.  **Configurable Sync Policies:** Mitigate storage constraints on mobile devices by allowing users to exclude large files (e.g., PDFs, videos) from syncing to phones, while still displaying virtual placeholders.
5.  **Offline-First Auto-Merging:** Seamlessly resolve concurrent edits on the same files when multiple offline devices reconnect, while giving the user a mechanism to review and revert merges.

## Decision

We will adopt the following stack and architecture to implement these capabilities:

```
+-----------------------------------------------------------------------------------+
|                            Octarine App Shell (Tauri)                             |
+-----------------------------------------------------------------------------------+
|               REACT UI (Tailwind, Gestures, Custom Merges View)                   |
+-----------------------------------------------------------------------------------+
|                                       |                                           |
| (Local Reads/Queries)                 | (E2EE CRDT updates)                       |
v                                       v                                           |
+-------------------+       +-----------------------+                               |
|   SQLite Cache    |       |   Yjs/Automerge CRDT  |                               |
| (Local DB Index)  |       |   Document Store      |                               |
+-------------------+       +-----------+-----------+                               |
                                        |                                           |
                                        | (Encrypted Sync Packet)                   |
                                        v                                           |
                            +-----------------------+                               |
                            | libp2p / WebRTC Mesh  | <--- Optional Headless Relay  |
                            | (P2P Transport)       |      (Encrypted Always-On)    |
                            +-----------------------+                               |
                                        |                                           |
                                        v (Decrypted & Reconciled)                  |
                            +-----------------------+                               |
                            | Markdown Local Files  |                               |
                            | (Plaintext Vault)     |                               |
                            +-----------------------+                               |
```

### 1. Technology Runtime: Tauri + Tauri Mobile + React (Established v1.0)

We select **Tauri** as the application shell for desktop and mobile clients.

- **v1.0 (Desktop Baseline):** Runs React/Vite within native operating system WebView wrappers, using Rust's high-speed notify systems, SQLite connectivity, and local disk APIs.
- **v2.0 (Mobile & Web Expansion):** Leverages Tauri Mobile (compiling 100% of our React codebase and gestures natively for iOS and Android) and modern web configurations.
- **Rust Efficiency:** High-throughput networking, encryption calculation, and filesystem polling are handled by Tauri's Rust core.

### 2. Synchronization Layer: Yjs/Automerge CRDTs over libp2p (v2.0)

Instead of simple block-level file copying, we translate the markdown vault structure into a local **Conflict-free Replicated Data Type (CRDT)** document map.

- **Character-Level Auto-Merge:** Edits made to files are captured as fine-grained, concurrent CRDT updates. When offline devices reconnect, their states merge seamlessly character-by-character.
- **Peer Discovery & Mesh Transport:** Direct peer connections are formed over WebRTC or local LAN using **libp2p**. No central database handles coordinate data.
- **Optional Headless Mailbox Node:** To facilitate offline syncing where direct peer-to-peer connection is impossible, we support an optional, headless self-hosted sync node (running in Docker/NAS/Raspberry Pi) that acts as an encrypted mailbox relay.

### 3. Trust Framework & Key Exchange (v2.0)

To establish a secure, private network, devices must exchange symmetric encryption keys (`XChaCha20-Poly1305`).

- **Method A (Local QR Code Scan):** Quick P2P key transfer over secure local camera-to-screen scan.
- **Method B (12-Word Recovery Passphrase):** Handshake credentials derived from a 12-word mnemonic phrase for manual configurations.

### 4. Smart Sync Filtering (Mobile Constraints) (v2.0)

To protect mobile bandwidth and storage:

- Users configure directory, extension, and file size limits (e.g., `exclude_extensions: ["pdf", "mp4"]`, `max_file_size: "10MB"`).
- Excluded files appear in the mobile UI as virtual placeholders with a "Cloud Download" icon. Clicking them triggers an on-demand block request to a connected online desktop peer to fetch and cache the file.

### 5. Merge Tracking & User Review Interface (v2.0)

Because auto-merges happen silently under CRDTs, we will introduce a **Recent Merges View** in the UI:

- A dedicated database table `merge_reviews` tracks character differences of automatically merged sessions.
- The user can open this panel to review recent changes made by other devices, with clear green/red diff markers and a simple one-click "Revert to My State" button.

---

## Consequences

### v1.0 Architectural Precautions (How We Avoid Boxing Ourselves In)

To ensure the transition from v1.0 (local desktop) to v2.0 (E2EE P2P Sync & Expanded Targets) is painless, our immediate v1.0 codebase must adhere to these structural boundaries:

1.  **Strict Adapter Abstraction:**
    - The frontend state management must never communicate with the filesystem or database directly.
    - All reads, writes, and database operations must flow through abstract interfaces (e.g., `FileSystemAdapter.readFile`, `FileSystemAdapter.writeFile`). In v1.0, this invokes local Tauri Rust IPC endpoints. In v2.0, this points to a Yjs/Automerge CRDT state buffer.
2.  **Stateless AST Parser:**
    - Our Markdown parser (AST-to-JSON) must remain stateless and deterministic. It takes file text and outputs objects, which allows it to parse CRDT string buffers as easily as it parses local disk files.
3.  **Unified State Event Bus:**
    - Tauri Rust events sent to the React frontend are structured payload-based, targeting exact document hashes rather than file locks, preparing the frontend to process live stream merges smoothly.
