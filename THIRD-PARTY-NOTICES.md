# Third-Party Notices

This project redistributes data derived from third-party open-source sources.
Their original license and copyright notices are reproduced below, as required.

---

## ECDICT — English → Chinese dictionary data

`data/meanings.json` (the Chinese meanings and KK phonetics for the ~2000 words) is
**derived from ECDICT**. The meanings were extracted from ECDICT, reduced to the common
junior-high sense, and converted from Simplified to Traditional Chinese. The KK phonetics
are taken from ECDICT as-is.

> Note: the example sentences in `data/meanings.json` are original to this project
> (model-generated), not from ECDICT.

- **Project:** ECDICT — Free English to Chinese Dictionary Database
- **Source:** https://github.com/skywind3000/ECDICT
- **License:** MIT

```
MIT License

Copyright (c) 2025 Linwei

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Build-time tools (not redistributed)

The Simplified → Traditional Chinese conversion was performed with **OpenCC**
(https://github.com/BYVoid/OpenCC, Apache-2.0). OpenCC is used only during data
preparation and is not included in this repository.
