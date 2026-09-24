import os
import sys
import unittest
from unittest.mock import MagicMock, patch

# Ensure backend root is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.text_extraction import (
    TextExtractionService,
    get_baidu_ocr,
)

class TestOCRService(unittest.TestCase):
    def test_baidu_ocr_graceful_cpu_fallback(self):
        """Verify get_baidu_ocr does not crash when CUDA is unavailable."""
        mock_torch = MagicMock()
        mock_torch.cuda.is_available.return_value = False
        with patch("services.text_extraction.torch", mock_torch):
            with patch("services.text_extraction._baidu_ocr_attempted", False):
                with patch("services.text_extraction._baidu_ocr_model", None):
                    model, tokenizer = get_baidu_ocr()
                    self.assertIsNone(model)
                    self.assertIsNone(tokenizer)

    def test_txt_and_md_extraction(self):
        """Verify standard text and markdown extraction."""
        import tempfile
        service = TextExtractionService()
        with tempfile.NamedTemporaryFile("w+", suffix=".md", delete=False, encoding="utf-8") as f:
            f.write("# Panduan Sistem RAG\nIni adalah pengujian ekstraksi.")
            temp_path = f.name

        try:
            pages, meta = service._extract_sync(temp_path, "text/markdown", ocr=False)
            self.assertEqual(len(pages), 1)
            self.assertIn("Panduan Sistem RAG", pages[0]["text"])
            self.assertFalse(meta["ocr_applied"])
        finally:
            os.remove(temp_path)

    def test_image_format_support(self):
        """Verify image file formats (.jpg, .png) are recognized and processed via OCR pipeline."""
        service = TextExtractionService()
        
        # Test with mock OCR
        with patch("services.text_extraction.get_baidu_ocr", return_value=(None, None)):
            with patch("services.text_extraction.get_easyocr_reader") as mock_easyocr:
                mock_reader_inst = MagicMock()
                mock_reader_inst.readtext.return_value = ["BARIS OCR 1", "BARIS OCR 2"]
                mock_easyocr.return_value = mock_reader_inst

                pages, meta = service._extract_sync("sample_receipt.jpg", "image/jpeg", ocr=True)
                self.assertEqual(len(pages), 1)
                self.assertIn("BARIS OCR 1", pages[0]["text"])
                self.assertTrue(meta["ocr_applied"])
                self.assertEqual(meta["ocr_engine"], "easyocr")

    def test_baidu_ocr_pdf_mock_flow(self):
        """Verify Baidu OCR parsing branch when model is loaded."""
        service = TextExtractionService()
        
        mock_model = MagicMock()
        mock_tok = MagicMock()
        
        with patch("services.text_extraction.get_baidu_ocr", return_value=(mock_model, mock_tok)):
            with patch("services.text_extraction.extract_pdf_with_baidu_ocr") as mock_extract:
                mock_extract.return_value = [
                    {"text": "# Halaman 1\nTabel Konten", "page_number": 1},
                    {"text": "# Halaman 2\nKesimpulan", "page_number": 2},
                ]
                mock_pdfplumber = MagicMock()
                mock_pdf = MagicMock()
                mock_pdf.pages = [MagicMock(extract_text=lambda: "")]
                mock_pdfplumber.open.return_value.__enter__.return_value = mock_pdf

                with patch("services.text_extraction.pdfplumber", mock_pdfplumber):
                    pages, meta = service._extract_sync("sample_scanned.pdf", "application/pdf", ocr=True)
                    self.assertEqual(len(pages), 2)
                    self.assertTrue(meta["ocr_applied"])
                    self.assertEqual(meta["ocr_engine"], "baidu_unlimited_ocr")
                    self.assertEqual(meta["page_count"], 2)


if __name__ == "__main__":
    unittest.main()
