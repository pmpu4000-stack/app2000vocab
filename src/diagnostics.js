// =====================================================================
// diagnostics.js — Educational Diagnostic Error Taxonomy for English Spelling
// Implements psychometric & error-analysis classifications:
// 1. 雙子音遺漏 (Double Consonant Miss)
// 2. 靜音/不發音字母 (Silent Letters)
// 3. 詞尾後綴盲點 (Suffix / Word Ending Variations)
// 4. 形近/同音詞混淆 (Homophone / Lookalike Confusion)
// 5. 母音弱音混淆 (Vowel / Schwa Digraphs)
// 6. 音形記憶加強 (General Orthographic Memory)
// =====================================================================

export function diagnoseWordMistake(word, guess = "") {
  const w = String(word || "").trim().toLowerCase();
  const g = String(guess || "").trim().toLowerCase();

  // 1. 雙子音遺漏 (Double Consonant Miss, e.g. address, dinner, letter, rabbit)
  const doubleConsonantRegex = /([bcdfghjklmnpqrstvwxyz])\1/i;
  if (doubleConsonantRegex.test(w)) {
    if (g && !doubleConsonantRegex.test(g)) {
      return { tag: "雙子音遺漏", code: "double_consonant", desc: "遺漏雙子音 (如 dd/tt/ss/ll/pp/mm/nn)", color: "#EF4444", bg: "#FEE2E2" };
    }
    if (!g) {
      return { tag: "雙子音", code: "double_consonant", desc: "雙子音拼寫盲點", color: "#EF4444", bg: "#FEE2E2" };
    }
  }

  // 2. 靜音/不發音字母 (Silent Letters: kn-, wr-, -mb, -bt, -igh, -alk, -alf, -gn)
  if (/(?:^kn|^wr|mb$|bt$|igh|alk$|alf$|^ps|^pn|gn$)/i.test(w)) {
    return { tag: "靜音字母", code: "silent_letter", desc: "含不發音字母 (如 kn-, wr-, -mb, igh)", color: "#8B5CF6", bg: "#EDE9FE" };
  }

  // 3. 詞尾後綴盲點 (Suffix variations: tion/sion, able/ible, ence/ance, ous, ture, ment, etc.)
  if (/(tion|sion|able|ible|ence|ance|ous|ious|ture|sure|ment|less|ful|ly|ness)$/i.test(w)) {
    return { tag: "詞尾後綴", code: "suffix_confusion", desc: "常用字尾/詞尾變化盲點", color: "#F59E0B", bg: "#FEF3C7" };
  }

  // 4. 形近 / 同音詞混淆 (Lookalike / homophone pairs)
  const lookalikes = [
    "quiet", "quite", "weather", "whether", "except", "accept",
    "affect", "effect", "advice", "advise", "loose", "lose",
    "principle", "principal", "hear", "here", "their", "there",
    "piece", "peace", "flower", "flour", "wear", "where"
  ];
  if (lookalikes.includes(w)) {
    return { tag: "形近同音", code: "lookalike", desc: "常見形近或同音易混淆詞", color: "#EC4899", bg: "#FCE7F3" };
  }

  // 5. 母音與弱音混淆 (Vowel / Schwa Digraphs: ea/ee, ai/ay, oa/ou, ie/ei, au/aw, oo, ue)
  if (/(ea|ee|ai|ay|oa|ou|ie|ei|au|aw|oo|ue)/i.test(w)) {
    return { tag: "母音弱音", code: "vowel_schwa", desc: "雙母音或非重讀弱音易混淆", color: "#3B82F6", bg: "#DBEAFE" };
  }

  // 6. 一般音形記憶 (Orthographic Memory)
  return { tag: "音形記憶", code: "orthographic", desc: "音形對應與記憶加強", color: "#6B7280", bg: "#F3F4F6" };
}
