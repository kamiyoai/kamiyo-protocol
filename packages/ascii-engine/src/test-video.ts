import { videoToAscii, getVideoInfo } from './video.js';

async function testVideo() {
  const videoPath = '/Users/dennisgoslar/Desktop/kamiyo-chinese.mp4';

  console.log('\n🎬 Testing Video to ASCII...\n');

  // Get video info
  const info = await getVideoInfo(videoPath);
  console.log('Video Info:');
  console.log('  Resolution:', info.width, 'x', info.height);
  console.log('  Duration:', info.duration.toFixed(2), 's');
  console.log('  FPS:', info.fps);
  console.log('  Codec:', info.codec);

  // Convert first 2 seconds
  console.log('\nConverting first 2 seconds to ASCII...\n');

  const video = await videoToAscii(videoPath, {
    width: 80,
    charset: 'blocks',
    fps: 5,  // Low FPS for demo
    endTime: 2,
    maxFrames: 10
  }, (progress) => {
    process.stdout.write('\r  ' + progress.stage + ': ' + progress.percent.toFixed(1) + '%');
  });

  console.log('\n\nGenerated frames:', video.frames.length);
  console.log('Output dimensions:', video.width, 'x', video.height);

  // Show first frame
  console.log('\nFirst frame:');
  console.log('─'.repeat(80));
  console.log(video.frames[0].text);

  // Show last frame
  if (video.frames.length > 1) {
    console.log('\nLast frame:');
    console.log('─'.repeat(80));
    console.log(video.frames[video.frames.length - 1].text);
  }

  console.log('\n✓ Video test complete!\n');
}

testVideo().catch(console.error);
