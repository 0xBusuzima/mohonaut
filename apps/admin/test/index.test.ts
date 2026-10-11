import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from '../src/index.js';

describe('admin skeleton', () => {
  it('builds and exports its name', () => {
    expect(PACKAGE_NAME).toBe('@mohonaut/admin');
  });
});
