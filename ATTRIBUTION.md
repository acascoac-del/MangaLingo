# Attribution & Third-Party Notices

This product (MangaLingo) includes software developed by third parties under
various open-source licenses. The following notices acknowledge those
contributions.

## manga-image-translator

- **Project**: <https://github.com/zyddnys/manga-image-translator>
- **License**: MIT License
- **Copyright**: (c) zyddnys and contributors
- **Use**: MangaLingo uses the detection, OCR, inpainting, translation, and
  rendering modules from manga-image-translator as the underlying engine for
  its translation pipeline. These modules are located under
  `mini-services/manga-api/manga_translator/` and retain their original
  license and copyright notices.

The MIT License requires that the copyright notice and permission notice be
included in all copies or substantial portions of the software. The original
license file is preserved at
`mini-services/manga-api/manga_translator/manga_translator.py` (header) and
the upstream repository LICENSE file.

## manga-ocr

- **Project**: <https://github.com/kha-white/manga-ocr>
- **License**: Apache License 2.0
- **Copyright**: (c) kha-white
- **Use**: Optical character recognition specialized for Japanese manga text.
- **Model**: `kha-white/manga-ocr-base` on Hugging Face.

## LaMa (Large Mask Inpainting)

- **Project**: <https://github.com/advimman/lama>
- **License**: Apache License 2.0
- **Use**: Image inpainting to erase original text from manga panels.

## Comic Text Detector (CTD)

- **Project**: <https://github.com/dmMaze/comic-text-detector>
- **License**: Apache License 2.0
- **Use**: Text and bubble detection in comic/manga images.

## M2M100

- **Project**: <https://huggingface.co/facebook/m2m100_418M>
- **License**: MIT License
- **Copyright**: (c) Facebook, Inc. and its affiliates.
- **Use**: Many-to-many translation model used as the default offline
  translator for non-API-key workflows.

## PyTorch

- **Project**: <https://pytorch.org/>
- **License**: BSD-style license
- **Copyright**: (c) Facebook, Inc. and its affiliates
- **Use**: Tensor computation and deep learning framework.

## Transformers (Hugging Face)

- **Project**: <https://github.com/huggingface/transformers>
- **License**: Apache License 2.0
- **Use**: Model loading and inference for OCR and translation models.

## OpenCV

- **Project**: <https://opencv.org/>
- **License**: Apache License 2.0
- **Use**: Image processing operations.

## Pillow

- **Project**: <https://python-pillow.org/>
- **License**: HPND License
- **Use**: Image manipulation and text rendering.

## FastAPI

- **Project**: <https://fastapi.tiangolo.com/>
- **License**: MIT License
- **Use**: HTTP API server framework.

## Next.js

- **Project**: <https://nextjs.org/>
- **License**: MIT License
- **Copyright**: (c) Vercel, Inc.
- **Use**: Frontend web framework for the demo and download portal.

## shadcn/ui

- **Project**: <https://ui.shadcn.com/>
- **License**: MIT License
- **Use**: React UI components used in the web frontend.

## Tailwind CSS

- **Project**: <https://tailwindcss.com/>
- **License**: MIT License
- **Use**: Utility-first CSS framework.

## Tesseract OCR

- **Project**: <https://github.com/tesseract-ocr/tesseract>
- **License**: Apache License 2.0
- **Use**: Optional lightweight OCR fallback (not used in the default
  pipeline, which uses manga-ocr).

## deep-translator

- **Project**: <https://github.com/nidhaloff/deep-translator>
- **License**: MIT License
- **Use**: Optional translation library for free online translators.

---

## License Summary

MangaLingo's own source code (everything outside of
`mini-services/manga-api/manga_translator/` and excluding third-party Python
packages installed via pip) is provided under the MIT License.

The `manga_translator/` directory contains code from manga-image-translator,
which is also MIT-licensed, and retains its original copyright notice.

For any questions about licensing or attribution, contact the project
maintainer.
