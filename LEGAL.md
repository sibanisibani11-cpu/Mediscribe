# Legal Notices, Regulatory Disclaimers & Licenses

**MediScribe** — Developed by MediApp.store
**Website**: https://mediapp.store
**Contact**: support@mediapp.store | legal@mediapp.store

---

## 1. Medical & Clinical Regulatory Disclaimer

### Non-Medical Device Declaration
MediScribe is an assistive administrative dictation and documentation tool designed solely to assist licensed healthcare providers in transcribing and formatting spoken words.

- **Not a Medical Device**: MediScribe is **not** a certified medical device under the United States Food, Drug, and Cosmetic Act (21 U.S.C. § 360j(o)(1)(E)), European Union Medical Device Regulation (EU MDR 2017/745), or equivalent international healthcare regulations.
- **No Clinical Diagnosis or Treatment**: MediScribe does not provide medical diagnoses, treatment recommendations, drug dosage calculations, or clinical decisions.
- **Clinician Responsibility**: Licensed healthcare professionals retain sole legal, ethical, and clinical responsibility for reviewing, editing, verifying, and approving all generated transcripts, notes, and medical records prior to entry into electronic health records (EHR/EMR) or communicating with patients.

---

## 2. Privacy, HIPAA Compliance & Audio Recording Consent

### Local-First Data Processing
- **No Audio Transmission**: All speech-to-text recognition (Whisper AI) and local language modeling (Ollama) run entirely on the local device (`localhost`). No audio recordings, spoken words, or patient transcripts are transmitted to MediApp.store servers or any third-party cloud infrastructure.
- **Immediate Data Scrubbing**: Temporary audio cache files created during dictation are immediately deleted upon transcription completion or failure.

### Patient & Two-Party Recording Consent
Healthcare providers using MediScribe in clinical environments are solely responsible for complying with applicable federal, state, and local recording consent laws (including two-party/all-party consent statutes such as California Penal Code § 632, Florida Stat. § 934.03, and international equivalents). Providers must obtain all required consents from patients and staff prior to activating audio recording.

---

## 3. Open-Source Software Licenses & Model Attributions

MediScribe incorporates and builds upon open-source software and AI models:

### Meta Llama 3.2
- **Attribution**: Built with Meta Llama 3.2.
- **License**: Meta Llama 3.2 is licensed under the [Llama 3.2 Community License](https://github.com/meta-llama/llama-models/blob/main/models/llama3_2/LICENSE), Copyright © Meta Platforms, Inc. All Rights Reserved.

### Whisper.cpp
- **Copyright**: Copyright © 2023-2026 Georgi Gerganov
- **License**: MIT License. Whisper is an open-source model created by OpenAI and ported to C/C++ by Georgi Gerganov.

### FFmpeg
- **License**: GNU Lesser General Public License (LGPL) version 2.1.
- **Compliance**: FFmpeg is invoked as an unmodified standalone executable binary (`ffmpeg` / `ffmpeg.exe`) via process boundaries for audio conversion. In accordance with LGPL v2.1, FFmpeg configure scripts, build documentation, and source archives are made available in the application package under `licenses/ffmpeg/`.

### Uiohook (uiohook-napi)
- **Copyright**: Copyright © Alexander Drozdov
- **License**: MIT License. Used for system-level hotkey and keyword expansion events.

---

## 4. Limitation of Liability & Warranty Disclaimer

TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW:
1. **"AS IS" BASIS**: MEDISCRIBE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR ACCURACY OF TRANSCRIPTION.
2. **NO LIABILITY FOR CLINICAL ERRORS**: MEDIAPP.STORE AND ITS DEVELOPERS SHALL NOT BE LIABLE FOR ANY MEDICAL ERRORS, MISDIAGNOSES, TREATMENT DELAYS, INACCURATE DOSAGES, OR ADVERSE PATIENT OUTCOMES RESULTING FROM THE USE OF OR INABILITY TO USE MEDISCRIBE.
3. **DAMAGES CAP**: IN NO EVENT SHALL TOTAL LIABILITY EXCEED THE AMOUNT PAID BY THE USER FOR THE SOFTWARE IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.

---

## 5. Contact & Privacy Information

- **Privacy Policy**: [https://mediapp.store/privacy](https://mediapp.store/privacy)
- **Terms of Service**: [https://mediapp.store/terms](https://mediapp.store/terms)
- **Support**: [support@mediapp.store](mailto:support@mediapp.store)
