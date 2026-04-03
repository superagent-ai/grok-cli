import { execFile } from "child_process";

const thumbnailCache = new Map<string, Buffer | null>();

function ffmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("ffmpeg", ["-version"], { timeout: 3000 }, (err) => resolve(!err));
  });
}

let ffmpegChecked: boolean | null = null;

export async function extractVideoThumbnail(videoPath: string): Promise<Buffer | null> {
  const cached = thumbnailCache.get(videoPath);
  if (cached !== undefined) return cached;

  if (ffmpegChecked === null) {
    ffmpegChecked = await ffmpegAvailable();
  }
  if (!ffmpegChecked) {
    thumbnailCache.set(videoPath, null);
    return null;
  }

  return new Promise((resolve) => {
    const args = ["-i", videoPath, "-vframes", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"];

    execFile(
      "ffmpeg",
      args,
      { encoding: "buffer", maxBuffer: 10 * 1024 * 1024, timeout: 15000 } as never,
      (err, stdout) => {
        if (err || !stdout || (stdout as unknown as Buffer).length === 0) {
          thumbnailCache.set(videoPath, null);
          resolve(null);
          return;
        }
        const buf = stdout as unknown as Buffer;
        thumbnailCache.set(videoPath, buf);
        resolve(buf);
      },
    );
  });
}
