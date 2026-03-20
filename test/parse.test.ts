import { describe, expect, it } from 'vitest';
import { CliError } from '../src/core/errors.js';
import {
  extractAuthorizationCode,
  parseAssignment,
} from '../src/core/parse.js';

describe('parseAssignment', () => {
  it('parses key=value pairs', () => {
    expect(parseAssignment('BSH.Common.Option=1', 'option')).toEqual({
      key: 'BSH.Common.Option',
      value: '1',
    });
  });

  it('splits on the first equals sign only', () => {
    expect(parseAssignment('A=B=C', 'setting')).toEqual({
      key: 'A',
      value: 'B=C',
    });
  });

  it('rejects invalid assignments', () => {
    try {
      parseAssignment('invalid', 'option');
      throw new Error('Expected parseAssignment to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect(error).toMatchObject({
        code: 'INVALID_ASSIGNMENT',
        message:
          'Expected option in key=value form, e.g. --option Feature.Key=value',
      });
    }
  });
});

describe('extractAuthorizationCode', () => {
  it('extracts and decodes the code from a redirect URL', () => {
    expect(
      extractAuthorizationCode(
        'https://apiclient.home-connect.com/o2c.html?code=abc%2Fdef%3D&state=test',
      ),
    ).toBe('abc/def=');
  });

  it('accepts a raw authorization code unchanged', () => {
    expect(extractAuthorizationCode('abc/def=')).toBe('abc/def=');
  });

  it('rejects redirect URLs without a code parameter', () => {
    expect(() =>
      extractAuthorizationCode(
        'https://apiclient.home-connect.com/o2c.html?state=test',
      ),
    ).toThrowError(/does not contain a code parameter/);
  });
});
