import logging
import os
import asyncio
try:
    import pdfplumber
except ImportError:
    pdfplumber = None

try:
    import docx
except ImportError:
    docx = None

try:
    import pypdfium2 as pdfium
except ImportError:
    pdfium = None

try:
    import easyocr
except ImportError:
    easyocr = None

try:
    import torch
except ImportError:
    torch = None

try:
    import numpy as np
except ImportError:
    np = None

import re
import tempfile
import shutil
from pathlib import Path
from typing import Tuple, List, Dict, Optional
try:
    from models.document import Document
except ImportError:
    Document = object

try:
    from services.context import PipelineContext
except ImportError:
    PipelineContext = object
import hashlib

import threading
import glob

logger = logging.getLogger(__name__)

_easyocr_reader = None
_easyocr_lock = threading.Lock()

_baidu_ocr_model = None
_baidu_ocr_tokenizer = None
_baidu_ocr_attempted = False
_baidu_ocr_lock = threading.Lock()


def get_easyocr_reader():
    """Singleton getter for EasyOCR reader with thread-safety and corrupted download recovery."""
    global _easyocr_reader
    with _easyocr_lock:
        if _easyocr_reader is None:
            if easyocr is None:
                raise RuntimeError("EasyOCR is not installed in the environment.")
            cuda_available = torch.cuda.is_available() if torch else False
            logger.info(f"Initializing EasyOCR reader (en, id) on {'GPU (CUDA)' if cuda_available else 'CPU'}...")
            try:
                _easyocr_reader = easyocr.Reader(['en', 'id'], gpu=cuda_available)
            except Exception as e:
                if "BadZipFile" in str(e) or "not a zip file" in str(e).lower():
                    logger.warning("Detected corrupted EasyOCR model zip. Cleaning and retrying...")
                    easyocr_model_dir = os.path.expanduser("~/.EasyOCR/model")
                    for zip_f in glob.glob(os.path.join(easyocr_model_dir, "*.zip")):
                        try:
                            os.remove(zip_f)
                        except Exception:
                            pass
                    _easyocr_reader = easyocr.Reader(['en', 'id'], gpu=cuda_available)
                else:
                    raise
    return _easyocr_reader



def get_baidu_ocr():
    """
    Singleton getter for Baidu Unlimited-OCR model & tokenizer.
    Loads onto NVIDIA GPU (CUDA) with bfloat16. Returns (model, tokenizer) or (None, None).
    """
    global _baidu_ocr_model, _baidu_ocr_tokenizer, _baidu_ocr_attempted
    with _baidu_ocr_lock:
        if _baidu_ocr_attempted:
            return _baidu_ocr_model, _baidu_ocr_tokenizer

        _baidu_ocr_attempted = True

        if not torch or not torch.cuda.is_available():
            logger.info("CUDA GPU not detected. Skipping Baidu Unlimited-OCR (using CPU fallback).")
            return None, None

        try:
            # Patch transformers import_utils for compatibility with Baidu modeling_deepseekv2
            try:
                import transformers.utils.import_utils as t_import_utils
                if not hasattr(t_import_utils, "is_torch_fx_available"):
                    t_import_utils.is_torch_fx_available = lambda: True
            except Exception:
                pass

            try:
                import transformers.utils as t_utils
                if not hasattr(t_utils, "is_torch_fx_available"):
                    t_utils.is_torch_fx_available = lambda: True
            except Exception:
                pass

            # Patch PIL._typing._Ink for Pillow / torchvision compatibility
            try:
                import PIL._typing
                import typing
                if not hasattr(PIL._typing, "_Ink"):
                    PIL._typing._Ink = typing.Union[int, float, tuple, str]
            except Exception:
                pass

            from transformers import AutoModel, AutoTokenizer

            # Check if local checkpoint path or HuggingFace repo is specified
            model_name = os.getenv("BAIDU_OCR_MODEL_PATH", "").strip()
            if not model_name:
                # Check local directories first if present
                possible_local_paths = [
                    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "baidu")),
                    "/content/orlith_backend/baidu",
                    "/content/baidu",
                ]
                for p in possible_local_paths:
                    if os.path.isdir(p) and os.path.exists(os.path.join(p, "config.json")):
                        model_name = p
                        break
                if not model_name:
                    model_name = "baidu/Unlimited-OCR"

            logger.info(f"Loading Baidu Unlimited-OCR from '{model_name}' on NVIDIA GPU (bfloat16)...")
            _baidu_ocr_tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
            _baidu_ocr_model = AutoModel.from_pretrained(
                model_name,
                trust_remote_code=True,
                use_safetensors=True,
                torch_dtype=torch.bfloat16,
            ).eval().cuda()
            logger.info("Baidu Unlimited-OCR successfully loaded onto NVIDIA GPU!")
        except Exception as e:
            logger.warning(
                f"Failed to initialize Baidu Unlimited-OCR ({e}). "
                "Pipeline will gracefully fallback to EasyOCR."
            )
            _baidu_ocr_model = None
            _baidu_ocr_tokenizer = None

    return _baidu_ocr_model, _baidu_ocr_tokenizer


def extract_pdf_with_baidu_ocr(pdf_path: str, dpi: int = 200) -> List[Dict]:
    """
    Extracts high-fidelity structured Markdown from PDF using Baidu Unlimited-OCR.
    Handles single-page and multi-page PDFs with Reference Sliding Window Attention (R-SWA).
    Returns list of dicts: [{"text": page_markdown, "page_number": int}]
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise RuntimeError("PyMuPDF (fitz) is required for Baidu Unlimited-OCR PDF extraction.")

    model, tokenizer = get_baidu_ocr()
    if model is None or tokenizer is None:
        raise RuntimeError("Baidu Unlimited-OCR model is not available.")

    doc = fitz.open(pdf_path)
    page_count = len(doc)
    if page_count == 0:
        doc.close()
        return []

    tmp_dir = tempfile.mkdtemp(prefix="pdf_ocr_pages_")
    out_dir = tempfile.mkdtemp(prefix="pdf_ocr_out_")
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    image_paths = []

    try:
        for i, page in enumerate(doc):
            out_img = os.path.join(tmp_dir, f"page_{i+1:04d}.png")
            page.get_pixmap(matrix=mat).save(out_img)
            image_paths.append(out_img)
        doc.close()

        logger.info(f"Running Baidu Unlimited-OCR on {len(image_paths)} pages (DPI: {dpi})...")

        if len(image_paths) == 1:
            # Single-page parsing with high-res crop mode
            model.infer(
                tokenizer,
                prompt="<image>document parsing.",
                image_file=image_paths[0],
                output_path=out_dir,
                base_size=1024,
                image_size=640,
                crop_mode=True,
                max_length=32768,
                no_repeat_ngram_size=35,
                ngram_window=128,
                save_results=True,
            )
        else:
            # Multi-page parsing using base 1024
            model.infer_multi(
                tokenizer,
                prompt="<image>Multi page parsing.",
                image_files=image_paths,
                output_path=out_dir,
                image_size=1024,
                max_length=32768,
                no_repeat_ngram_size=35,
                ngram_window=1024,
                save_results=True,
            )

        # Retrieve parsed markdown from output_dir
        result_md_file = os.path.join(out_dir, "result.md")
        full_md = ""
        if os.path.exists(result_md_file):
            with open(result_md_file, "r", encoding="utf-8") as f:
                full_md = f.read()

        pages_data = []
        if "<PAGE>" in full_md:
            raw_pages = full_md.split("<PAGE>")
            p_idx = 1
            for raw_p in raw_pages:
                clean_text = raw_p.strip()
                if clean_text:
                    pages_data.append({"text": clean_text, "page_number": p_idx})
                    p_idx += 1
        elif full_md.strip():
            pages_data.append({"text": full_md.strip(), "page_number": 1})

        if not pages_data:
            raise RuntimeError("Baidu Unlimited-OCR output is empty.")

        return pages_data

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        shutil.rmtree(out_dir, ignore_errors=True)


def extract_image_with_baidu_ocr(image_path: str) -> List[Dict]:
    """
    Extracts structured Markdown from single image file (.jpg, .jpeg, .png, .webp).
    """
    model, tokenizer = get_baidu_ocr()
    if model is None or tokenizer is None:
        raise RuntimeError("Baidu Unlimited-OCR model is not available.")

    out_dir = tempfile.mkdtemp(prefix="img_ocr_out_")
    try:
        model.infer(
            tokenizer,
            prompt="<image>document parsing.",
            image_file=image_path,
            output_path=out_dir,
            base_size=1024,
            image_size=640,
            crop_mode=True,
            max_length=32768,
            no_repeat_ngram_size=35,
            ngram_window=128,
            save_results=True,
        )

        result_md_file = os.path.join(out_dir, "result.md")
        full_md = ""
        if os.path.exists(result_md_file):
            with open(result_md_file, "r", encoding="utf-8") as f:
                full_md = f.read().strip()

        if not full_md:
            raise RuntimeError("Baidu Unlimited-OCR returned empty text from image.")

        return [{"text": full_md, "page_number": 1}]
    finally:
        shutil.rmtree(out_dir, ignore_errors=True)


class TextExtractionService:
    async def extract(self, document: Document, ocr: bool, ctx: PipelineContext) -> Tuple[List[Dict], Dict]:
        ctx.transition("extracting")
        start_time = asyncio.get_event_loop().time()
        
        pages_data, metadata = await asyncio.to_thread(
            self._extract_sync, document.file_path, document.file_type, ocr
        )
        
        # Calculate text hash and update metadata
        full_text = " ".join([p["text"] for p in pages_data])
        normalized_text = re.sub(r'\s+', ' ', full_text).strip()
        metadata["text_hash"] = hashlib.sha256(normalized_text.encode("utf-8")).hexdigest()
        
        # Heuristic Metadata enrichment (P7)
        metadata["title"] = self._extract_title(pages_data)
        metadata["author"] = self._extract_author(full_text)
        
        # P6: Non-blocking Language Detection
        try:
            from langdetect import detect
            metadata["language"] = detect(normalized_text[:1000]) if normalized_text else "unknown"
        except Exception as e:
            logger.warning(f"Language detection failed: {e}")
            metadata["language"] = "unknown"
        
        elapsed = asyncio.get_event_loop().time() - start_time
        ctx.record("extraction_time", elapsed)
        
        return pages_data, metadata

    def _extract_sync(self, file_path: str, file_type: str, ocr: bool) -> Tuple[List[Dict], Dict]:
        file_path_lower = file_path.lower()
        metadata = {"ocr_applied": False, "page_count": 1, "ocr_engine": "none"}
        pages_data = []

        # Plain Text / Markdown Files
        if file_path_lower.endswith(".txt") or file_path_lower.endswith(".md") or file_type in ("text/plain", "text/markdown"):
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                text_content = f.read()
            pages_data.append({"text": text_content, "page_number": 1})
            metadata["page_count"] = 1

        # Word (DOCX) Files
        elif file_path_lower.endswith(".docx") or file_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            try:
                doc = docx.Document(file_path)
                text_parts = []
                for paragraph in doc.paragraphs:
                    if paragraph.text:
                        text_parts.append(paragraph.text)

                for table in doc.tables:
                    for row in table.rows:
                        for cell in row.cells:
                            if cell.text:
                                text_parts.append(cell.text)

                text_content = "\n".join(text_parts)
                pages_data.append({"text": text_content, "page_number": 1})
                metadata["page_count"] = len(doc.paragraphs)
            except Exception as docx_err:
                logger.warning(f"python-docx parsing failed: {docx_err}. Attempting raw XML zip fallback...")
                try:
                    import zipfile
                    import xml.etree.ElementTree as ET
                    with zipfile.ZipFile(file_path) as docx_zip:
                        xml_content = docx_zip.read('word/document.xml')
                    root = ET.fromstring(xml_content)
                    text_parts = []
                    for elem in root.iter():
                        if elem.tag.endswith('}t') and elem.text:
                            text_parts.append(elem.text)
                    text_content = " ".join(text_parts)
                    if not text_content.strip():
                        raise ValueError("No text extracted from word/document.xml")
                    pages_data.append({"text": text_content, "page_number": 1})
                    metadata["page_count"] = 1
                    logger.info("Raw XML zip fallback successfully extracted text from DOCX.")
                except Exception as fallback_err:
                    raise RuntimeError(f"Word (DOCX) text extraction failed. python-docx error: {docx_err}. XML zip fallback error: {fallback_err}")

        # PDF Files
        elif file_path_lower.endswith(".pdf") or file_type == "application/pdf":
            page_count = 0
            total_text = ""
            try:
                with pdfplumber.open(file_path) as pdf:
                    page_count = len(pdf.pages)
                    for i, page in enumerate(pdf.pages):
                        page_text = page.extract_text()
                        if page_text:
                            pages_data.append({"text": page_text, "page_number": i + 1})
                            total_text += page_text
            except Exception as e:
                logger.warning(f"pdfplumber text extraction failed, falling back to OCR if available. Error: {e}")

            metadata["page_count"] = page_count

            # Apply OCR if requested or text is empty/sparse (< 50 chars)
            if ocr or len(total_text.strip()) < 50:
                logger.info("PDF has very little text or OCR was explicitly requested. Attempting OCR...")
                
                # 1. Try Baidu Unlimited-OCR on GPU first
                baidu_model, _ = get_baidu_ocr()
                if baidu_model is not None:
                    try:
                        logger.info("Attempting extraction via Baidu Unlimited-OCR on GPU...")
                        ocr_pages = extract_pdf_with_baidu_ocr(file_path)
                        if ocr_pages:
                            pages_data = ocr_pages
                            metadata["ocr_applied"] = True
                            metadata["ocr_engine"] = "baidu_unlimited_ocr"
                            metadata["page_count"] = len(pages_data)
                            logger.info(f"Baidu Unlimited-OCR extracted {len(pages_data)} pages successfully.")
                            return pages_data, metadata
                    except Exception as baidu_err:
                        logger.warning(f"Baidu OCR failed: {baidu_err}. Falling back to EasyOCR...")

                # 2. Fallback to EasyOCR
                try:
                    pages_data.clear()
                    pdf_doc = pdfium.PdfDocument(file_path)
                    page_count = len(pdf_doc)
                    metadata["page_count"] = page_count

                    reader = get_easyocr_reader()

                    for i, page in enumerate(pdf_doc):
                        image = page.render(scale=2).to_pil()
                        image_np = np.array(image)
                        results = reader.readtext(image_np, detail=0)
                        page_text = "\n".join(results)
                        if page_text:
                            pages_data.append({"text": page_text, "page_number": i + 1})

                    metadata["ocr_applied"] = True
                    metadata["ocr_engine"] = "easyocr"
                except Exception as e:
                    raise RuntimeError(f"OCR processing failed: {str(e)}")

        # Standalone Image Files (.jpg, .jpeg, .png, .webp)
        elif (
            file_path_lower.endswith((".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"))
            or (file_type and file_type.startswith("image/"))
        ):
            logger.info(f"Extracting text from image file: {file_path}")
            
            # 1. Try Baidu Unlimited-OCR on GPU
            baidu_model, _ = get_baidu_ocr()
            if baidu_model is not None:
                try:
                    pages_data = extract_image_with_baidu_ocr(file_path)
                    metadata["ocr_applied"] = True
                    metadata["ocr_engine"] = "baidu_unlimited_ocr"
                    metadata["page_count"] = 1
                    return pages_data, metadata
                except Exception as b_err:
                    logger.warning(f"Baidu OCR on image failed ({b_err}), falling back to EasyOCR.")

            # 2. Fallback to EasyOCR
            try:
                reader = get_easyocr_reader()
                results = reader.readtext(file_path, detail=0)
                page_text = "\n".join(results)
                pages_data.append({"text": page_text, "page_number": 1})
                metadata["ocr_applied"] = True
                metadata["ocr_engine"] = "easyocr"
                metadata["page_count"] = 1
            except Exception as e:
                raise RuntimeError(f"Image OCR processing failed: {str(e)}")

        else:
            raise ValueError(f"Unsupported file format: {file_type} or file extension for {file_path}")

        return pages_data, metadata

    def _extract_title(self, pages: List[Dict]) -> Dict:
        """Heuristic title extraction."""
        if not pages:
            return {"value": "unknown", "confidence": 0.0}
        
        first_page = pages[0]["text"].split("\n")
        # Assume first non-empty line could be title
        for line in first_page:
            clean_line = line.strip()
            # Strip markdown headers if any (e.g. # Title -> Title)
            clean_line = re.sub(r'^#+\s*', '', clean_line)
            if len(clean_line) > 5 and len(clean_line) < 100:
                return {"value": clean_line, "confidence": 0.75}
                
        return {"value": "unknown", "confidence": 0.0}
        
    def _extract_author(self, full_text: str) -> Dict:
        """Heuristic author extraction."""
        match = re.search(r'(?i)(?:author|by|penulis)\s*[:]\s*([a-zA-Z\s,]+)', full_text[:2000])
        if match:
            author = match.group(1).strip()
            if len(author) > 2 and len(author) < 100:
                return {"value": author, "confidence": 0.85}
        return {"value": "unknown", "confidence": 0.0}
