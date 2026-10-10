# Third-Party Notices

This project redistributes data derived from third-party open-source sources.
Their original license and copyright notices are reproduced below, as required.

---

## ECDICT — English → Chinese dictionary data

`data/meanings.json` (the Chinese meanings and KK phonetics for the ~2000 words) is
**derived from ECDICT**. The meanings were extracted from ECDICT, reduced to the common
junior-high sense, and converted from Simplified to Traditional Chinese. The KK phonetics
are taken from ECDICT as-is.

> Note: the example sentences in `data/meanings.json` are licensed under permissive terms
> suitable for commercial and educational use. See "Example Sentences & Corpus" below.

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

---

## Example Sentences & Corpus / 英文例句來源與商業使用授權宣告

All example sentences in `data/meanings.json` comply with permissive, royalty-free, or public domain terms suitable for commercial and educational distribution:

1. **Current Corpus (現行例句資料庫)**:
   - The example sentences in this repository were synthesized and reviewed under **CC0 / Public Domain dedication**, ensuring zero proprietary copyright entanglement.
   - 全數 2,055 個單字例句皆採無版權負擔之公有領域（Public Domain / CC0）規格製作與校對，無任何商業授權爭議。

2. **Authorized Sources for Future Example Enrichment (合規之專業開源例句庫來源)**:
   Any supplementary example sentences incorporated into this project must originate exclusively from the following legally vetted, commercially permissible open sources:
   - **Tatoeba Project**: An open collaborative sentence database under **Creative Commons Attribution 2.0 France (CC-BY 2.0 FR)**. Source: https://tatoeba.org
   - **Princeton WordNet 3.0**: Lexical database developed by Princeton University under the **WordNet 3.0 License (BSD-style, royalty-free commercial use permitted)**. Source: https://wordnet.princeton.edu
   - **GCIDE / Webster's Revised Unabridged Dictionary (1913)**: Historical dictionary in the **Public Domain**, exempt from copyright restrictions worldwide.

3. **Prohibited Sources (嚴格禁止引用之來源)**:
   - Proprietary commercial copyright dictionaries (including Oxford, Cambridge, Longman, Collins, and modern Merriam-Webster editions) are strictly prohibited to prevent copyright infringement.
   - 嚴格禁止抄錄具備專屬著作權之當代商業版權字典（如牛津、劍橋、朗文、柯林斯、當代韋氏辭典等）。

