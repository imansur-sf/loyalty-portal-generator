# PDF reader assets

Vendored from `pdfjs-dist` **6.4.299**, using its legacy minified ES module
build for compatibility with browsers lacking the newest Promise methods.
The Apache 2.0 license is included in this directory.

Refresh after deliberately updating the pinned package:

```sh
cp node_modules/pdfjs-dist/legacy/build/pdf.min.mjs assets/pdfjs/
cp node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs assets/pdfjs/
cp node_modules/pdfjs-dist/LICENSE assets/pdfjs/LICENSE
python3 build-standalone.py
```

The hosted editor imports these files locally on demand. The standalone build
embeds both as data URLs. The reader extracts selectable text and retains page
boundaries; it does not run OCR or render the PDF. Source binaries are not stored
in LPG projects. API reference: https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html
