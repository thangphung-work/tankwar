import argparse
import asyncio
import tempfile
from pathlib import Path

import av
import edge_tts


LINES = {
    "attack": "Attack!",
    "focus": "Focus fire!",
    "yes": "Affirmative!",
    "backup": "Need backup!",
    "fallback": "Fall back!",
    "defend": "Defend!",
    "no": "Negative!",
    "spotted": "Enemy spotted!",
    "obj_a": "A point!",
    "obj_b": "B point!",
    "obj_c": "C point!",
}

# A firm, mature voice at a brisk command cadence. Radio coloration is applied
# at playback by quick_comms.js, so these source clips deliberately stay clean.
VOICE = "en-US-RogerNeural"
RATE = "+32%"
PITCH = "-6Hz"
VOLUME = "+8%"


def mp3_to_radio_wav(source: Path, destination: Path) -> None:
    with av.open(str(source)) as incoming, av.open(str(destination), "w") as outgoing:
        stream = outgoing.add_stream("pcm_s16le", rate=16000)
        stream.layout = "mono"
        resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
        for frame in incoming.decode(audio=0):
            for converted in resampler.resample(frame):
                for packet in stream.encode(converted):
                    outgoing.mux(packet)
        for converted in resampler.resample(None):
            for packet in stream.encode(converted):
                outgoing.mux(packet)
        for packet in stream.encode(None):
            outgoing.mux(packet)


async def generate(output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="tankwar-radio-") as temp_dir:
        temp = Path(temp_dir)
        for key, words in LINES.items():
            mp3 = temp / f"{key}.mp3"
            await edge_tts.Communicate(
                words, VOICE, rate=RATE, pitch=PITCH, volume=VOLUME
            ).save(str(mp3))
            destination = output_dir / f"{key}.wav"
            mp3_to_radio_wav(mp3, destination)
            print(f"Generated {destination}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Tank War radio commands")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "assets" / "sfx" / "radio",
    )
    args = parser.parse_args()
    asyncio.run(generate(args.output.resolve()))


if __name__ == "__main__":
    main()
