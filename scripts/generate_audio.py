"""Generate Google Cloud TTS audio for a lesson defined by lesson.json.

Usage:
    python scripts/generate_audio.py materials/lesson-01

Auth:
    set GOOGLE_APPLICATION_CREDENTIALS to the path of your service-account JSON
    (or run `gcloud auth application-default login`).

Outputs (under <lesson_dir>/audio/):
    full_normal.mp3, full_slow.mp3
    s01_normal.mp3, s01_slow.mp3, s02_normal.mp3, ... (one pair per sentence)

Idempotent: existing files are skipped unless --force is passed.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from google.cloud import texttospeech


def synthesize(client, text, voice_name, language_code, speaking_rate, output_path):
    request = texttospeech.SynthesizeSpeechRequest(
        input=texttospeech.SynthesisInput(text=text),
        voice=texttospeech.VoiceSelectionParams(
            language_code=language_code,
            name=voice_name,
        ),
        audio_config=texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            speaking_rate=speaking_rate,
        ),
    )
    response = client.synthesize_speech(request=request)
    output_path.write_bytes(response.audio_content)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("lesson_dir", type=Path, help="Path to a lesson directory containing lesson.json")
    parser.add_argument("--force", action="store_true", help="Regenerate even if output files exist")
    args = parser.parse_args()

    lesson_path = args.lesson_dir / "lesson.json"
    if not lesson_path.exists():
        sys.exit(f"lesson.json not found: {lesson_path}")

    lesson = json.loads(lesson_path.read_text(encoding="utf-8"))
    audio_cfg = lesson.get("audio", {})
    voice_name = audio_cfg.get("voice", "en-US-Neural2-D")
    language_code = audio_cfg.get("language_code", "en-US")
    speeds = audio_cfg.get("speeds", {"normal": 1.0, "slow": 0.85})

    audio_dir = args.lesson_dir / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)

    full_text = lesson["passage"]["english"]
    sentences = lesson["passage"]["sentences"]

    targets: list[tuple[str, Path, float]] = []
    for speed_name, rate in speeds.items():
        targets.append((full_text, audio_dir / f"full_{speed_name}.mp3", rate))
        for s in sentences:
            sid = f"s{int(s['id']):02d}"
            targets.append((s["en"], audio_dir / f"{sid}_{speed_name}.mp3", rate))

    client = texttospeech.TextToSpeechClient()

    generated = 0
    skipped = 0
    for text, path, rate in targets:
        if path.exists() and not args.force:
            skipped += 1
            continue
        synthesize(client, text, voice_name, language_code, rate, path)
        generated += 1
        print(f"  generated: {path.name}")

    print(f"\nDone. generated={generated}, skipped={skipped}, total={len(targets)}")
    print(f"  voice={voice_name}, language={language_code}, speeds={speeds}")


if __name__ == "__main__":
    main()
