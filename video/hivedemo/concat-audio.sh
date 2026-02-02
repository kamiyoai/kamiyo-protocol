#!/bin/bash
# Concatenate all scene audio files into a single file
# Requires: ffmpeg

cd "$(dirname "$0")/audio"

# Create file list
cat > filelist.txt << EOF
file 'scene1.mp3'
file 'scene2.mp3'
file 'scene3.mp3'
file 'scene4.mp3'
file 'scene5.mp3'
file 'scene6.mp3'
file 'scene7.mp3'
file 'scene8.mp3'
EOF

# Concatenate with 0.5s silence between scenes
ffmpeg -y -f concat -safe 0 -i filelist.txt -c:a libmp3lame -q:a 2 full-narration.mp3

# Clean up
rm filelist.txt

echo ""
echo "Created: audio/full-narration.mp3"
echo ""

# Show duration
duration=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 full-narration.mp3)
echo "Total duration: ${duration}s"
