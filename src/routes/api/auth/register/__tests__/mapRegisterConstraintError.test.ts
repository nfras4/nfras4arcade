import { describe, test, expect } from 'bun:test';
import { _mapRegisterConstraintError } from '../+server';

describe('_mapRegisterConstraintError', () => {
  test('maps users.email constraint to 409 Email already registered', () => {
    const result = _mapRegisterConstraintError('UNIQUE constraint failed: users.email');
    expect(result).toEqual({ status: 409, error: 'Email already registered' });
  });

  test('is case-insensitive for the constraint message', () => {
    const result = _mapRegisterConstraintError('UNIQUE CONSTRAINT FAILED: USERS.EMAIL');
    expect(result).toEqual({ status: 409, error: 'Email already registered' });
  });

  test('maps player_profiles.display_name constraint to 409 That display name is taken', () => {
    const result = _mapRegisterConstraintError('UNIQUE constraint failed: player_profiles.display_name');
    expect(result).toEqual({ status: 409, error: 'That display name is taken' });
  });

  test('maps player_profiles.display_name case-insensitively', () => {
    const result = _mapRegisterConstraintError('unique constraint failed: PLAYER_PROFILES.DISPLAY_NAME');
    expect(result).toEqual({ status: 409, error: 'That display name is taken' });
  });

  test('returns 500 Registration failed for unrecognised constraint', () => {
    const result = _mapRegisterConstraintError('UNIQUE constraint failed: some_other_table.col');
    expect(result).toEqual({ status: 500, error: 'Registration failed' });
  });

  test('returns 500 for a completely unrelated error message', () => {
    const result = _mapRegisterConstraintError('disk I/O error');
    expect(result).toEqual({ status: 500, error: 'Registration failed' });
  });
});
