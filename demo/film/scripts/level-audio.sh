#!/bin/zsh
# Levels every spoken clip the film uses to one loudness (-19 LUFS, -2 dBTP) so narration, the actor's question,
# the buyers' TTS and the wiretap sit together; the final master is normalised to -14 LUFS afterwards.
# Sources stay untouched in demo/vo2 and the game's TTS endpoint; this rewrites only the copies under public/.
set -e
cd "$(dirname "$0")/.."
for f in public/vo2/*.mp3 public/take-audio/*.mp3; do
  tmp="${f%.mp3}.leveling.mp3"
  ffmpeg -loglevel error -y -i "$f" -af "loudnorm=I=-19:TP=-2:LRA=11" -ar 44100 -c:a libmp3lame -b:a 192k "$tmp"
  mv "$tmp" "$f"
done
echo "levelled $(ls public/vo2/*.mp3 public/take-audio/*.mp3 | wc -l | tr -d ' ') clips"
