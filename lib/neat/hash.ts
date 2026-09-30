/**
 * Hash não criptográfico (dois FNV-1a de 32 bits com constantes diferentes), só com Math.imul.
 * Serve para provar determinismo entre navegadores; não use para segurança.
 */
export function hashString(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9747b28c;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ (c + 0x9e), 0x85ebca6b);
    h2 ^= h2 >>> 13;
  }
  return hex32(h1) + hex32(h2);
}

function hex32(n: number): string {
  return (n >>> 0).toString(16).padStart(8, "0");
}
