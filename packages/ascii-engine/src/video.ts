/**
 * Video Processing Module
 *
 * Handles video to ASCII conversion using FFmpeg.
 */

import ffmpeg from 'fluent-ffmpeg';
import { mkdir, readdir, readFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { imageToAscii } from './image.js';
import type { VideoOptions, AsciiVideo, AsciiFrame, ProgressCallback, ExportOptions } from './types.js';

/**
 * Extract frames from video to temporary directory
 */
async function extractFrames(
  videoPath: string,
  outputDir: string,
  options: VideoOptions,
  onProgress?: ProgressCallback
): Promise<{ frameCount: number; fps: number; duration: number }> {
  return new Promise((resolve, reject) => {
    // Get video info first
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }

      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      if (!videoStream) {
        reject(new Error('No video stream found'));
        return;
      }

      const sourceFps = eval(videoStream.r_frame_rate || '24') as number;
      const duration = parseFloat(String(videoStream.duration || metadata.format.duration || '0'));
      const targetFps = options.fps || sourceFps;

      let command = ffmpeg(videoPath)
        .outputOptions([
          `-vf fps=${targetFps}`,
          '-frame_pts 1'
        ])
        .output(join(outputDir, 'frame_%06d.png'));

      // Time range
      if (options.startTime !== undefined) {
        command = command.setStartTime(options.startTime);
      }
      if (options.endTime !== undefined) {
        command = command.setDuration(options.endTime - (options.startTime || 0));
      }

      let frameCount = 0;

      command
        .on('progress', (progress) => {
          if (onProgress) {
            const percent = progress.percent || 0;
            onProgress({
              current: Math.floor(percent),
              total: 100,
              percent,
              stage: 'extracting'
            });
          }
        })
        .on('end', async () => {
          // Count extracted frames
          const files = await readdir(outputDir);
          frameCount = files.filter(f => f.startsWith('frame_')).length;
          resolve({ frameCount, fps: targetFps, duration });
        })
        .on('error', reject)
        .run();
    });
  });
}

/**
 * Convert video to ASCII frames
 */
export async function videoToAscii(
  videoPath: string,
  options: VideoOptions = {},
  onProgress?: ProgressCallback
): Promise<AsciiVideo> {
  // Create temp directory for frames
  const tempDir = join(tmpdir(), `ascii-video-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });

  try {
    // Extract frames
    const { frameCount, fps, duration } = await extractFrames(
      videoPath,
      tempDir,
      options,
      onProgress
    );

    // Process frames
    const frames: AsciiFrame[] = [];
    const files = await readdir(tempDir);
    const frameFiles = files
      .filter(f => f.startsWith('frame_') && f.endsWith('.png'))
      .sort();

    const maxFrames = options.maxFrames || frameFiles.length;
    const framesToProcess = frameFiles.slice(0, maxFrames);

    for (let i = 0; i < framesToProcess.length; i++) {
      const framePath = join(tempDir, framesToProcess[i]);
      const frameBuffer = await readFile(framePath);

      const asciiFrame = await imageToAscii(frameBuffer, options);
      asciiFrame.timestamp = i / fps;
      frames.push(asciiFrame);

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: framesToProcess.length,
          percent: ((i + 1) / framesToProcess.length) * 100,
          stage: 'processing'
        });
      }
    }

    return {
      frames,
      fps,
      duration: frames.length / fps,
      width: frames[0]?.width || 0,
      height: frames[0]?.height || 0
    };

  } finally {
    // Cleanup temp directory
    await rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * Export ASCII video to file
 */
export async function exportAsciiVideo(
  asciiVideo: AsciiVideo,
  options: ExportOptions,
  onProgress?: ProgressCallback
): Promise<string> {
  const { format, outputPath, fps = asciiVideo.fps } = options;

  if (format === 'txt-sequence') {
    // Export as text files
    const outputDir = outputPath.replace(/\.\w+$/, '');
    await mkdir(outputDir, { recursive: true });

    for (let i = 0; i < asciiVideo.frames.length; i++) {
      const framePath = join(outputDir, `frame_${i.toString().padStart(6, '0')}.txt`);
      const { writeFile } = await import('fs/promises');
      await writeFile(framePath, asciiVideo.frames[i].text);

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: asciiVideo.frames.length,
          percent: ((i + 1) / asciiVideo.frames.length) * 100,
          stage: 'encoding'
        });
      }
    }

    return outputDir;
  }

  // For video formats, we need to render each frame as an image
  const tempDir = join(tmpdir(), `ascii-export-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });

  try {
    // Render frames as images
    const sharp = (await import('sharp')).default;
    const fontColor = options.fontColor || '#00ff00';
    const bgColor = options.backgroundColor || '#000000';

    for (let i = 0; i < asciiVideo.frames.length; i++) {
      const frame = asciiVideo.frames[i];
      const lines = frame.text.split('\n');

      // Create SVG for the frame
      const fontSize = 12;
      const charWidth = fontSize * 0.6;
      const lineHeight = fontSize * 1.2;
      const width = Math.ceil(frame.width * charWidth);
      const height = Math.ceil(frame.height * lineHeight);

      let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`;
      svg += `<rect width="100%" height="100%" fill="${bgColor}"/>`;
      svg += `<text font-family="monospace" font-size="${fontSize}px" fill="${fontColor}">`;

      lines.forEach((line, y) => {
        // Escape special characters
        const escaped = line
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/ /g, '&#160;');
        svg += `<tspan x="0" y="${(y + 1) * lineHeight}">${escaped}</tspan>`;
      });

      svg += '</text></svg>';

      // Convert SVG to PNG
      const framePath = join(tempDir, `frame_${i.toString().padStart(6, '0')}.png`);
      await sharp(Buffer.from(svg))
        .png()
        .toFile(framePath);

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: asciiVideo.frames.length,
          percent: ((i + 1) / asciiVideo.frames.length) * 50,
          stage: 'encoding'
        });
      }
    }

    // Encode video with FFmpeg
    await new Promise<void>((resolve, reject) => {
      let command = ffmpeg()
        .input(join(tempDir, 'frame_%06d.png'))
        .inputFPS(fps);

      if (format === 'gif') {
        command = command
          .outputOptions([
            '-vf', 'split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
            options.loop === false ? '-loop -1' : '-loop 0'
          ])
          .format('gif');
      } else if (format === 'mp4') {
        command = command
          .videoCodec('libx264')
          .outputOptions([
            '-pix_fmt yuv420p',
            `-crf ${Math.round(51 - (options.quality || 80) * 0.5)}`
          ])
          .format('mp4');
      } else if (format === 'webm') {
        command = command
          .videoCodec('libvpx-vp9')
          .outputOptions([
            `-crf ${Math.round(63 - (options.quality || 80) * 0.6)}`,
            '-b:v 0'
          ])
          .format('webm');
      }

      command
        .output(outputPath)
        .on('progress', (progress) => {
          if (onProgress) {
            onProgress({
              current: 50 + Math.floor((progress.percent || 0) / 2),
              total: 100,
              percent: 50 + (progress.percent || 0) / 2,
              stage: 'encoding'
            });
          }
        })
        .on('end', () => resolve())
        .on('error', reject)
        .run();
    });

    return outputPath;

  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * Get video metadata
 */
export async function getVideoInfo(videoPath: string): Promise<{
  width: number;
  height: number;
  duration: number;
  fps: number;
  codec: string;
}> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }

      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      if (!videoStream) {
        reject(new Error('No video stream found'));
        return;
      }

      resolve({
        width: videoStream.width || 0,
        height: videoStream.height || 0,
        duration: parseFloat(String(videoStream.duration || metadata.format.duration || '0')),
        fps: eval(videoStream.r_frame_rate || '24') as number,
        codec: videoStream.codec_name || 'unknown'
      });
    });
  });
}
