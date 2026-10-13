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

## Example Sentences & Bilingual Corpus / 英文例句來源與商業使用授權宣告

All example sentences and bilingual translations in `data/meanings.json` comply with permissive open licenses and public domain terms suitable for commercial, educational, and personal distribution without infringement risks:

---

### 1. Tatoeba Project (CC-BY 2.0 FR)

- **Project:** Tatoeba Project — Open Collaborative Bilingual Sentence Database
- **Website:** https://tatoeba.org / http://www.manythings.org/anki/
- **License:** Creative Commons Attribution 2.0 France (`CC-BY 2.0 FR`)
- **License Summary:** Free for commercial use, copying, adaptation, and redistribution under the condition of attribution.
- **Attribution Statement:**
  Example sentences and bilingual translations are contributed by volunteer authors and editors of the Tatoeba Project (tatoeba.org). Under CC-BY 2.0 FR, attribution is hereby given to Tatoeba and its contributing authors.

---

### 2. Princeton WordNet 3.0 (WordNet License)

- **Project:** Princeton University WordNet 3.0 Lexical Database
- **Website:** https://wordnet.princeton.edu
- **Copyright:** WordNet 3.0 Copyright 2006 by Princeton University. All rights reserved.
- **License:** WordNet License (BSD-style permissive open license)

```
WordNet 3.0 License

This software and database is being provided to you, the LICENSEE, by Princeton
University under the following license. By obtaining, using and/or copying this
software and database, you agree that you have read, understood, and will comply
with these terms and conditions.:

Permission to use, copy, modify and distribute this software and database and its
documentation for any purpose and without fee or royalty is hereby granted, provided
that you agree to comply with the following copyright notice and statements,
including the disclaimer, and that the same appear on ALL copies of the software,
database and documentation, including modifications that you make for internal use
or for distribution.

WordNet 3.0 Copyright 2006 by Princeton University. All rights reserved.

THIS SOFTWARE AND DATABASE IS PROVIDED "AS IS" AND PRINCETON UNIVERSITY MAKES NO
REPRESENTATIONS OR WARRANTIES, EXPRESS OR IMPLIED. BY WAY OF EXAMPLE, BUT NOT
LIMITATION, PRINCETON UNIVERSITY MAKES NO REPRESENTATIONS OR WARRANTIES OF
MERCHANTABILITY OR FITNESS FOR ANY PARTICULAR PURPOSE OR THAT THE USE OF THE
LICENSED SOFTWARE, DATABASE OR DOCUMENTATION WILL NOT INFRINGE ANY THIRD PARTY
PATENTS, COPYRIGHTS, TRADEMARKS OR OTHER RIGHTS.
```

---

### 3. Webster's Revised Unabridged Dictionary (1913) / GCIDE

- **Source:** Noah Porter, G. & C. Merriam Company (1913) / GNU Collaborative International Dictionary of English (GCIDE)
- **Legal Status:** Public Domain worldwide (Published prior to 1928; copyright expired under US and international copyright laws).
- **Terms:** Fully exempt from copyright restrictions. Completely free for reproduction, commercial derivative works, and redistribution worldwide.

---

### 4. Contextual Mini-Dialogues Corpus / 情境式微對話語料庫 (CC0 1.0 Universal)

- **Project / 資料庫名稱:** Contextual Mini-Dialogues Corpus — Tailored Conversational Mini-Dialogues for Junior High English 2000 Vocabulary (情境式生活微對話語料庫)
- **Legal Status / 法律性質:** Creative Commons Zero 1.0 Universal (`CC0 1.0 Public Domain Dedication`) / 著作權公有領域奉獻
- **License URL:** https://creativecommons.org/publicdomain/zero/1.0/
- **Copyright Statement / 權利宣告:**
  The creator and contributors have dedicated the work to the public domain by waiving all copyright and related or neighboring rights worldwide under copyright law.
  原創團隊已將本語料庫之所有著作權與相關鄰接權奉獻至公有領域。
- **Commercial & Educational Terms / 商業使用與教育條款:**
  - **100% 免費可商用：** 允許任何人、任何組織在世界任何地區，永久、不受限制地進行複製、修改、發行、改編、納入商業產品或進行衍生開發。
  - **無授權金與專利要求：** 免付版權金（Royalty-Free），免商業利用審批，無著作權侵權法律風險。
  - **雙聲道 (Dual-Voice) 對話支援：** 本語料庫設計為角色 A（問）與角色 B（答）情境問答句型，完美支援 Web Speech API 男女聲雙聲道交替朗讀。

---

### 5. Prohibited Commercial Dictionary Warning / 嚴格禁止引用之來源

Proprietary commercial copyright dictionaries (including Oxford University Press, Cambridge University Press, Longman/Pearson, Collins/HarperCollins, and contemporary editions of Merriam-Webster) are **strictly prohibited** in this project to prevent copyright infringement.
嚴格禁止抄錄具備專利與著作權之現代商業出版字典（如牛津、劍橋、朗文、柯林斯等）。

