import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from '../src/index.js';

describe('keeper skeleton', () => {
  it('builds and exports its name', () => {
    expect(PACKAGE_NAME).toBe('@mohonaut/keeper');
  });
});
