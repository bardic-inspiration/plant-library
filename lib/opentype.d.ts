// The part of opentype.js (which ships no types) that lib/glyph-fonts.ts uses.
declare module 'opentype.js' {
  const opentype: { parse(buffer: ArrayBuffer): unknown };
  export default opentype;
}
