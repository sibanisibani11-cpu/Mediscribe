# Synthetic audio fixtures

These files contain a generated 440 Hz sine tone lasting 0.5 seconds, with no speech or user audio. `audio-tone.webm` uses Opus and `audio-tone.m4a` uses AAC. The native smoke test converts both to 16 kHz mono PCM using the same arguments as the application. This verifies the browser recording formats against the minimal FFmpeg build.

The separate speech-inference test downloads the JFK sample from the checksum-pinned upstream whisper.cpp v1.8.2 source archive at runtime. No microphone or customer recordings are used.
