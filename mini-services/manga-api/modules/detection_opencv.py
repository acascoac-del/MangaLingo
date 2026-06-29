"""Lightweight OpenCV-based text balloon detector.

Detects white-ish speech-bubble regions using MSER + contour analysis.
This is a pragmatic fallback for the heavy ML detectors shipped in
`detection.zip` (CRAFT / DBNet / CTD) which require GPU and model weights.

For each detected region it returns:
    {
        "bbox": [x1, y1, x2, y2],
        "polygon": [[x, y], ...],
        "confidence": float,
    }
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Any
import cv2
import numpy as np


@dataclass
class OpenCVDetector:
    """Detect candidate text regions inside speech bubbles.

    Strategy:
      1. Convert to grayscale.
      2. Use MSER to find stable regions.
      3. Keep regions whose bounding-box is "text-like" (aspect ratio & size).
      4. Cluster nearby boxes into balloons.
    """

    min_area: int = 60
    max_area: int = 250_000
    min_aspect: float = 0.08
    max_aspect: float = 18.0

    def detect(self, image: np.ndarray) -> list[dict[str, Any]]:
        if image is None or image.size == 0:
            return []

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape

        # MSER works well for text in manga because characters are darker blobs
        # on a light bubble background.
        mser = cv2.MSER_create()
        mser.setMinArea(self.min_area)
        mser.setMaxArea(self.max_area)
        try:
            regions, _ = mser.detectRegions(gray)
        except Exception:
            return []

        raw_boxes: list[tuple[int, int, int, int]] = []
        for pts in regions:
            xs = pts[:, 0]
            ys = pts[:, 1]
            x1, x2 = int(xs.min()), int(xs.max())
            y1, y2 = int(ys.min()), int(ys.max())
            bw, bh = x2 - x1 + 1, y2 - y1 + 1
            if bw < 4 or bh < 4:
                continue
            aspect = bw / max(1, bh)
            if not (self.min_aspect <= aspect <= self.max_aspect):
                continue
            raw_boxes.append((x1, y1, x2, y2))

        if not raw_boxes:
            return []

        # Cluster boxes that are spatially close (same balloon / line).
        clusters = self._cluster_boxes(raw_boxes, gap_x=int(w * 0.025),
                                       gap_y=int(h * 0.025))
        results: list[dict[str, Any]] = []
        for cluster in clusters:
            x1 = min(b[0] for b in cluster)
            y1 = min(b[1] for b in cluster)
            x2 = max(b[2] for b in cluster)
            y2 = max(b[3] for b in cluster)
            bw, bh = x2 - x1 + 1, y2 - y1 + 1
            area = bw * bh
            if area < self.min_area * 4:
                continue
            # Pad a little so the renderer has breathing room.
            pad = max(3, int(min(bw, bh) * 0.06))
            x1 = max(0, x1 - pad)
            y1 = max(0, y1 - pad)
            x2 = min(w - 1, x2 + pad)
            y2 = min(h - 1, y2 + pad)
            polygon = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
            results.append({
                "bbox": [int(x1), int(y1), int(x2), int(y2)],
                "polygon": polygon,
                "confidence": float(min(1.0, len(cluster) / 25.0 + 0.25)),
            })

        # Cap the number of regions to keep API latency predictable.
        return results[:50]

    @staticmethod
    def _cluster_boxes(boxes, gap_x: int, gap_y: int):
        """Group boxes whose centers are within (gap_x, gap_y) of each other."""
        if not boxes:
            return []
        # Sort by reading order: top-to-bottom, then left-to-right
        boxes = sorted(boxes, key=lambda b: (b[1] // max(1, gap_y * 4), b[0]))
        clusters: list[list[tuple[int, int, int, int]]] = []
        for b in boxes:
            placed = False
            bx1, by1, bx2, by2 = b
            bcx = (bx1 + bx2) / 2
            bcy = (by1 + by2) / 2
            for cluster in clusters:
                for ref in cluster:
                    rx1, ry1, rx2, ry2 = ref
                    rcx = (rx1 + rx2) / 2
                    rcy = (ry1 + ry2) / 2
                    if (abs(bcx - rcx) <= gap_x * 4 and abs(bcy - rcy) <= gap_y * 4) \
                       or (abs(bx1 - rx2) <= gap_x and abs(by1 - ry2) <= gap_y and abs(by1 - ry2) >= 0) \
                       or (abs(bx2 - rx1) <= gap_x and abs(ry1 - by2) <= gap_y and abs(ry1 - by2) >= 0):
                        cluster.append(b)
                        placed = True
                        break
                if placed:
                    break
            if not placed:
                clusters.append([b])
        return clusters
