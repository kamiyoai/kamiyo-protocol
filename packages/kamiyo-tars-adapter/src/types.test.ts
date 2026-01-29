import { describe, it, expect } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import {
  TARS_PROGRAM_ID,
  USDC_DEVNET,
  USDC_MAINNET,
  isValidTarsRating,
  isValidReputationWeight,
  isValidQualityScore,
  DEFAULT_CONFIG,
  MAX_METADATA_URI_LENGTH,
  MAX_PAYMENT_AMOUNT,
} from './types';

describe('constants', () => {
  it('TARS_PROGRAM_ID is valid PublicKey', () => {
    expect(TARS_PROGRAM_ID).toBeInstanceOf(PublicKey);
    expect(TARS_PROGRAM_ID.toBase58()).toBe('GPd4z3N25UfjrkgfgSxsjoyG7gwYF8Fo7Emvp9TKsDeW');
  });

  it('USDC_DEVNET is valid PublicKey', () => {
    expect(USDC_DEVNET).toBeInstanceOf(PublicKey);
    expect(USDC_DEVNET.toBase58()).toBe('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vn2KGtKJr');
  });

  it('USDC_MAINNET is valid PublicKey', () => {
    expect(USDC_MAINNET).toBeInstanceOf(PublicKey);
    expect(USDC_MAINNET.toBase58()).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  });
});

describe('isValidTarsRating', () => {
  it('returns true for valid ratings 1-5', () => {
    expect(isValidTarsRating(1)).toBe(true);
    expect(isValidTarsRating(2)).toBe(true);
    expect(isValidTarsRating(3)).toBe(true);
    expect(isValidTarsRating(4)).toBe(true);
    expect(isValidTarsRating(5)).toBe(true);
  });

  it('returns false for ratings below 1', () => {
    expect(isValidTarsRating(0)).toBe(false);
    expect(isValidTarsRating(-1)).toBe(false);
  });

  it('returns false for ratings above 5', () => {
    expect(isValidTarsRating(6)).toBe(false);
    expect(isValidTarsRating(10)).toBe(false);
  });

  it('returns false for non-integer ratings', () => {
    expect(isValidTarsRating(3.5)).toBe(false);
    expect(isValidTarsRating(4.9)).toBe(false);
  });

  it('returns false for NaN', () => {
    expect(isValidTarsRating(NaN)).toBe(false);
  });
});

describe('DEFAULT_CONFIG', () => {
  it('has correct default values', () => {
    expect(DEFAULT_CONFIG.tarsProgramId).toEqual(TARS_PROGRAM_ID);
    expect(DEFAULT_CONFIG.mode).toBe('unified');
    expect(DEFAULT_CONFIG.syncReputation).toBe(true);
    expect(DEFAULT_CONFIG.autoSubmitFeedback).toBe(true);
    expect(DEFAULT_CONFIG.feedbackDelay).toBe(0);
    expect(DEFAULT_CONFIG.linkJobsToEscrows).toBe(true);
  });

  it('has valid reputation weights', () => {
    expect(DEFAULT_CONFIG.reputationWeight.kamiyo).toBe(0.7);
    expect(DEFAULT_CONFIG.reputationWeight.tars).toBe(0.3);
    expect(DEFAULT_CONFIG.reputationWeight.kamiyo + DEFAULT_CONFIG.reputationWeight.tars).toBe(1);
  });
});

describe('isValidReputationWeight', () => {
  it('returns true for valid weights summing to 1', () => {
    expect(isValidReputationWeight({ kamiyo: 0.7, tars: 0.3 })).toBe(true);
    expect(isValidReputationWeight({ kamiyo: 0.5, tars: 0.5 })).toBe(true);
    expect(isValidReputationWeight({ kamiyo: 1, tars: 0 })).toBe(true);
    expect(isValidReputationWeight({ kamiyo: 0, tars: 1 })).toBe(true);
  });

  it('returns false for weights not summing to 1', () => {
    expect(isValidReputationWeight({ kamiyo: 0.5, tars: 0.6 })).toBe(false);
    expect(isValidReputationWeight({ kamiyo: 0.3, tars: 0.3 })).toBe(false);
  });

  it('returns false for negative weights', () => {
    expect(isValidReputationWeight({ kamiyo: -0.1, tars: 1.1 })).toBe(false);
    expect(isValidReputationWeight({ kamiyo: 1.1, tars: -0.1 })).toBe(false);
  });

  it('returns false for weights > 1', () => {
    expect(isValidReputationWeight({ kamiyo: 1.5, tars: 0 })).toBe(false);
  });
});

describe('isValidQualityScore', () => {
  it('returns true for valid scores 0-100', () => {
    expect(isValidQualityScore(0)).toBe(true);
    expect(isValidQualityScore(50)).toBe(true);
    expect(isValidQualityScore(100)).toBe(true);
    expect(isValidQualityScore(75.5)).toBe(true);
  });

  it('returns false for scores below 0', () => {
    expect(isValidQualityScore(-1)).toBe(false);
    expect(isValidQualityScore(-100)).toBe(false);
  });

  it('returns false for scores above 100', () => {
    expect(isValidQualityScore(101)).toBe(false);
    expect(isValidQualityScore(200)).toBe(false);
  });

  it('returns false for non-finite values', () => {
    expect(isValidQualityScore(NaN)).toBe(false);
    expect(isValidQualityScore(Infinity)).toBe(false);
    expect(isValidQualityScore(-Infinity)).toBe(false);
  });
});

describe('constants', () => {
  it('MAX_METADATA_URI_LENGTH is 200', () => {
    expect(MAX_METADATA_URI_LENGTH).toBe(200);
  });

  it('MAX_PAYMENT_AMOUNT is ~4.294B (USDC limit)', () => {
    expect(MAX_PAYMENT_AMOUNT).toBe(4_294_000_000);
  });
});
