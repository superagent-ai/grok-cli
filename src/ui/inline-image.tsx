import { useEffect, useMemo, useRef, useState } from "react";
import { type HalfBlockGrid, isVideoFile, loadImageAsHalfBlocks } from "../utils/image-renderer.js";
import { extractVideoThumbnail } from "../utils/video-thumbnail.js";
import type { Theme } from "./theme.js";

const DEFAULT_MAX_COLS = 60;
const DEFAULT_MAX_ROWS = 20;

interface InlineImageProps {
  path: string;
  t: Theme;
  maxWidth?: number;
  maxHeight?: number;
}

export function InlineImage({ path, t, maxWidth, maxHeight }: InlineImageProps) {
  const maxCols = maxWidth ?? DEFAULT_MAX_COLS;
  const maxRows = maxHeight ?? DEFAULT_MAX_ROWS;
  const [grid, setGrid] = useState<HalfBlockGrid | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const loadedPathRef = useRef<string>("");

  useEffect(() => {
    if (loadedPathRef.current === path) return;
    loadedPathRef.current = path;

    let cancelled = false;
    setLoading(true);
    setError(false);

    (async () => {
      try {
        let source: string | Buffer = path;

        if (isVideoFile(path)) {
          const thumb = await extractVideoThumbnail(path);
          if (cancelled) return;
          if (!thumb) {
            setError(true);
            setLoading(false);
            return;
          }
          source = thumb;
        }

        const result = await loadImageAsHalfBlocks(source, maxCols, maxRows);
        if (cancelled) return;

        if (!result) {
          setError(true);
        } else {
          setGrid(result);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path, maxCols, maxRows]);

  const renderedRows = useMemo(() => {
    if (!grid) return null;
    return grid.rows.map((row, y) => (
      <text key={y} flexShrink={0}>
        {row.map((cell, x) => (
          <span key={x} style={{ fg: cell.fg, bg: cell.bg }}>
            {cell.ch}
          </span>
        ))}
      </text>
    ));
  }, [grid]);

  if (loading) {
    return (
      <text fg={t.textMuted} flexShrink={0}>
        Loading preview...
      </text>
    );
  }

  if (error || !renderedRows) {
    return null;
  }

  return (
    <box flexDirection="column" flexShrink={0}>
      {renderedRows}
    </box>
  );
}
