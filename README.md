# AKKI AI Desktop — Production Desktop Companion

<div align="center">
  <img src="public/branding/logo.png" width="96" alt="Akki AI Logo" />
  <h3>Your Personal Cyberpunk AI Companion & Multi-Agent Desktop Coordinator</h3>
</div>

---

## ✦ Overview
**AKKI AI** is a production-grade, cyberpunk-themed desktop AI companion application built from scratch for Windows using **Electron 34**, **React 19**, **TypeScript 5.8**, and **Vite 6**.

It combines:
- **Multimodal AI Dialogue**: Google Gemini API streaming with real-time thinking block breakdown (`**Assessing the Task**`) and tool invocation badges.
- **Dynamic Persona Engine (Soul)**:
  - **Despina (Female Default)**: Warm Caring Companion, Sarcastic Queen, Protective Angel, Mysterious Oracle with strict first-person feminine Hindi/Hinglish grammatical inflections (`"kar rahi hoon"`, `"de rahi hoon"`).
  - **Charon (Male Default)**: Caring Companion, Military Commander, Loyal Butler, Sarcastic Bro with masculine Hindi inflections (`"kar raha hoon"`).
- **Agent Town 2D RPG Office**: 4 specialist sub-agents operating autonomously in an interactive pixel-art office:
  - **Leo**: Heavy code and algorithmic analysis.
  - **Rancho**: Deep web research, scraping, and market intelligence.
  - **Raju**: Hardware automation and Arduino serial protocols.
  - **Chatur**: Mathematical reasoning, JSON schema enforcement, LaTeX formulas.
- **Durable Memory Vault**: Persistent Markdown memory synchronized at `~/.hermes/memories/MEMORY.md` and `~/.hermes/SOUL.md` with lossless deduplication and `Memory Optimizing...` state.
- **Native Floating HUD Windows (`open_info_panel`)**: Frameless, translucent OS breakdown windows supporting 5 neon cyberpunk themes (`cyan`, `amber`, `crimson`, `emerald`, `blue`).
- **Windy Satellite Weather Radar**: Embedded live interactive weather radar map and 10-hour forecast strip.
- **Top Neural Audio Player**: Interactive music bar with animated waveform, album art, and controls.
- **Strict Security Guardrails**: `contextIsolation: true`, `nodeIntegration: false`, rigorous Content Security Policy, allowlist command sanitization for `os_exec`, and restricted filesystem access.

---

## ✦ System Architecture & Directory Structure
```text
AkkiAiFresh/
├── public/
│   ├── agent-town/                  # 48x48 character walk cycles, tilesets, maps
│   ├── audio/                       # Futuristic WAV audio cues
│   └── branding/                    # High-res companion & app logos
├── release/
│   ├── win-unpacked/Akki Ai.exe     # Standalone portable Windows binary
│   └── Akki Ai Setup 2.1.0.exe      # Windows NSIS Installer
├── src/
│   ├── main/
│   │   ├── index.ts                 # Main process entry (single instance lock)
│   │   ├── ipc/                     # Typed IPC handlers with Zod validation
│   │   ├── security/                # CSP enforcement
│   │   ├── services/
│   │   │   ├── ai/                  # Gemini streaming & Persona engine
│   │   │   ├── agents/              # Agent Town sub-agent coordinator
│   │   │   ├── memory/              # Durable ~/.hermes/ sync & optimizer
│   │   │   ├── storage/             # Atomic LocalStore for tasks/notes/settings
│   │   │   └── tools/               # 16+ typed tools (web, fs, terminal, info panels)
│   │   └── windows/                 # Main & floating Info Panel window managers
│   ├── preload/
│   │   ├── index.ts                 # Context bridge
│   │   └── api.ts                   # Strongly typed window.electronAPI
│   ├── renderer/
│   │   ├── App.tsx                  # Dashboard layout container
│   │   ├── components/modals/       # Soul, Memory, Skills, Settings
│   │   ├── features/
│   │   │   ├── dashboard/           # Top Header & Neural Player
│   │   │   ├── companion/           # Anime Hero Hub & SVG glow wires
│   │   │   ├── agent-town/          # 2D Canvas interactive RPG office
│   │   │   ├── chat/                # Chat stream, thinking box, tool chips
│   │   │   ├── tasks/               # Tasks/Notes CRUD with priority filters
│   │   │   ├── weather/             # Windy Satellite Radar widget
│   │   │   └── visual-hub/          # Mermaid diagrams & image viewer
│   │   └── state/useAppStore.ts     # Global Zustand state store
│   └── shared/
│       ├── contracts/ipc.ts         # 40 typed IPC channels
│       ├── schemas/index.ts         # Runtime Zod validation schemas
│       └── types/index.ts           # Domain models
```

---

## ✦ Installation & Development

### 1. Prerequisites
- **Node.js**: v20+ or v25+
- **Windows**: Windows 10/11 x64
- **Package Manager**: npm 10+ or 11+

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Development Server
```bash
# Start Vite frontend hot-reloader
npm run dev

# Or launch in Electron
npm run electron:start
```

### 4. Typecheck & Verification
```bash
npm run typecheck
```

### 5. Production Builds
```bash
# Build frontend + electron main
npm run build
npm run build:electron

# Build Windows standalone unpacked executable
npm run pack

# Build Windows NSIS Installer
npm run dist
```

---

## ✦ Verification & Build Status
- **Typecheck**: Zero errors across both TypeScript configs (`tsconfig.json` and `tsconfig.electron.json`).
- **Packaging Verified**: Standalone executable generated at `release/win-unpacked/Akki Ai.exe` and NSIS installer at `release/Akki Ai Setup 2.1.0.exe`.
