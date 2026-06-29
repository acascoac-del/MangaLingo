import numpy as np
import cv2
from .common import CommonInpainter
from ..config import InpainterConfig

class SolidInpainter(CommonInpainter):

    async def _inpaint(self, image: np.ndarray, mask: np.ndarray, config: InpainterConfig, inpainting_size: int = 1024, verbose: bool = False) -> np.ndarray:
        # Dilate the text mask slightly to cover stroke anti-aliasing edges
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (4, 4))
        dilated_mask = cv2.dilate(mask, kernel, iterations=1)

        # OpenCV fast inpainting: Telea algorithm is extremely fast and blends text into local background
        img_inpainted = cv2.inpaint(image, dilated_mask, 3, cv2.INPAINT_TELEA)
        return img_inpainted
