# 🩺 MediScribe

**AI-Powered Medical Transcription for Healthcare Professionals**

MediScribe is a state-of-the-art AI medical transcription solution tailored for the demanding workflows of physicians, nurses, and medical practitioners. It features a proprietary 3-stage AI verification engine that double-checks transcriptions against clinical context to eliminate hallucinations and ensure medical accuracy.

[![Website](https://img.shields.io/badge/Website-mediapp.store-blue?style=for-the-badge)](https://mediapp.store/apps/mediscribe)
[![Latest Release](https://img.shields.io/github/v/release/Kalpa-netizen/MediScribe?style=for-the-badge)](https://github.com/Kalpa-netizen/MediScribe/releases/latest)

## 🚀 Key Features

*   **🛡️ 3-Stage AI Verification**: Proprietary engine double-checks transcriptions against clinical context to ensure 99%+ medical accuracy and eliminate hallucinations.
*   **🔒 Offline Clinical Models**: 100% local processing on your device. No internet required for transcription. Total patient privacy (HIPAA compliant architecture).
*   **🫧 Floating Bubble Control**: Lightweight UI stays on top of any EMR/EHR for one-click or hotkey dictation with zero latency.
*   **🧼 Midnight Cobalt Interface**: Premium, high-contrast theme designed for low eye strain during long clinical sessions.
*   **📚 Custom Medical Dictionary**: Manage specialized clinical vocabulary, custom drug names, and personalized shorthand expansions.

## 📥 Download & Installation

You can download the latest installers from our [GitHub Releases](https://github.com/Kalpa-netizen/MediScribe/releases) page.

### Which file should I download?

| Platform | Download Link | Description |
| :--- | :--- | :--- |
| **Windows** | `MediScribe.Setup.1.0.4.exe` | Standard Windows Installer (Win 10/11) |
| **Mac (Apple Silicon)** | `MediScribe-1.0.4-arm64.dmg` | M1, M2, M3, M4 chips (2020+) |
| **Mac (Intel)** | `MediScribe-1.0.4.dmg` | Intel-based Macs (2006-2020) |
| **Linux** | `MediScribe-1.0.4.AppImage` | Universal Linux AppImage |

### 🛠️ Installation Steps

#### Windows
1. Download `MediScribe.Setup.1.0.4.exe`.
2. Double-click the file to start the installer.
3. Once finished, launch **MediScribe** from your Desktop or Start Menu.

#### macOS
1. Download the appropriate `.dmg` file for your architecture.
2. Open the `.dmg` file and drag **MediScribe** to your **Applications** folder.
3. Launch **MediScribe** from your Applications folder.
   * *Note: On first launch, you may need to right-click and select "Open" to bypass security prompts.*

---

## 💻 Development

This is a Next.js application integrated with Electron.

### Prerequisites
- Node.js 20+
- npm

### Local Setup
1.  **Install dependencies**:
    ```bash
    npm install
    ```
2.  **Run in development mode**:
    ```bash
    npm run dev
    ```
    The web interface will be available at [http://localhost:9002](http://localhost:9002).

3.  **Run with Electron**:
    ```bash
    npm run electron:dev
    ```

---

© 2025 [MediApp Store](https://mediapp.store) - Dedicated to Medical Excellence.
