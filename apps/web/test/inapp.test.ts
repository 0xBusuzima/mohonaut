import { describe, expect, it } from 'vitest';
import { inAppBrowser } from '../src/game/inapp';

describe('in-app browsers', () => {
  it('recognises the X, Instagram, Facebook, LINE and TikTok apps', () => {
    expect(
      inAppBrowser(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone/10.60',
      ),
    ).toBe('X');
    expect(inAppBrowser('Mozilla/5.0 (Linux; Android 15) TwitterAndroid')).toBe('X');
    expect(inAppBrowser('Mozilla/5.0 ... Instagram 350.0.0.0')).toBe('Instagram');
    expect(inAppBrowser('Mozilla/5.0 ... [FBAN/FBIOS;FBAV/480.0]')).toBe('Facebook');
    expect(inAppBrowser('Mozilla/5.0 ... Line/14.10.0')).toBe('LINE');
    expect(inAppBrowser('Mozilla/5.0 ... musical_ly_37.0')).toBe('TikTok');
  });

  it('leaves ordinary browsers and wallet browsers alone', () => {
    expect(
      inAppBrowser(
        'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36',
      ),
    ).toBeNull();
    expect(
      inAppBrowser(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBeNull();
    expect(inAppBrowser('Mozilla/5.0 (Linux; Android 15) MetaMaskMobile')).toBeNull();
  });
});
