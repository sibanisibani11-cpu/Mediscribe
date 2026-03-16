import os
import sys
from huggingface_hub import snapshot_download

MODEL_ID = "Systran/faster-whisper-base.en"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "../resources/models/faster-whisper-base.en")

def download_model():
    print(f"Downloading {MODEL_ID} to {OUTPUT_DIR}...")
    try:
        snapshot_download(
            repo_id=MODEL_ID,
            local_dir=OUTPUT_DIR,
            local_dir_use_symlinks=False,
            resume_download=True
        )
        print("Download complete.")
    except Exception as e:
        print(f"Error downloading model: {e}")
        sys.exit(1)

if __name__ == "__main__":
    download_model()
