import { expect, test } from 'bun:test';
import { oauthReturnPath } from './oauth-return-path';

test('preserves the complete local consent URL', () => {
  const path = '/.lovable/oauth/consent?authorization_id=abc#details';
  expect(oauthReturnPath(path)).toBe(path);
});
test('rejects external or malformed redirects', () => {
  for (const path of ['//outside.invalid', '/\\outside.invalid', 'https://outside.invalid', '/\nunsafe', null]) {
    expect(oauthReturnPath(path)).toBe('/');
  }
});