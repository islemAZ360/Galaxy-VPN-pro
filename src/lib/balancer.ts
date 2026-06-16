export function getBalancedType(id: string, originalType: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (Math.imul(31, hash) + id.charCodeAt(i)) | 0;
  }
  const isEven = Math.abs(hash) % 2 === 0;
  
  if (originalType === 'gemini_wifi') return isEven ? 'wifi' : 'gemini_wifi';
  if (originalType === 'gemini_lte') return isEven ? 'lte' : 'gemini_lte';
  return originalType;
}
