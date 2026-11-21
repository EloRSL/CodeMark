import { describe, expect, it } from 'vitest';
import { sha256Hex } from './hash';

describe('sha256Hex', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['čšž', 'c99337fed106cfe1f34200578d608bb187f3fc3e238272bb6d417b47cfcbe3da'], // UTF-8 bytes
  ])('hashes %j', async (text, hex) => {
    expect(await sha256Hex(text)).toBe(hex);
  });
});
