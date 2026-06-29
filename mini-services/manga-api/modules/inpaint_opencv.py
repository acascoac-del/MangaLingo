"""OpenCV inpainter using the classic Telea / Navier-Stokes algorithms.

This is the lightweight fallback for the heavy ML inpainters (LaMa, AOT, SD)
shipped in `inpainting/` of `detection.zip`. Those require GPU + model weights.

Telea usually gives the cleanest result for white speech bubbles with text;
we run it with a small radius and let the renderer paint over the result.
"""

from __future__ import annotations
from dataclasses import dataclass
import cv2
import numpy as np


@dataclass
class OpenCVInpainter:
    method: str = "telea"   # "telea" | "ns"
    radius: int = 3

    def inpaint(self, image_bgr: np.ndarray, mask: np.ndarray) -> np.ndarray:
        if image_bgr is None or mask is None:
            return image_bgr
        if mask.dtype != np.uint8:
            mask = (mask > 0).astype(np.uint8) * 255
        if mask.max() == 0:
            return image_bgr
        flag = cv2.INPAINT_TELEA if self.method == "telea" else cv2.INPAINT_NS
        # Slightly dilate the mask to cover anti-aliased text edges.
        kernel = np.ones((3, 3), np.uint8)
        mask = cv2.dilate(mask, kernel, iterations=1)
        return cv2.inpaint(image_bgr, mask, self.radius, flags=flag)
