/**
 * True when text contains non-Latin script characters worth romanizing
 * (Greek, Cyrillic, Armenian, Hebrew, Arabic, Indic, Thai, CJK, Kana, Hangul…).
 */
export function hasNonLatin(text: string): boolean {
  return /[Ͱ-ϿЀ-ӿ԰-֏֐-׿؀-ۿऀ-ॿঀ-෿฀-๿぀-ヿ㐀-鿿가-힯]/.test(
    text
  );
}
