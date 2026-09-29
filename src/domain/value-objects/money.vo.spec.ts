import { CurrencyMismatchError, Money } from './money.vo';

describe('Money', () => {
  it('adds amounts in the same currency', () => {
    const total = Money.of(1000, 'NGN').add(Money.of(500, 'NGN'));
    expect(total.amountMinor).toBe(1500);
  });

  it('rejects arithmetic across different currencies', () => {
    expect(() => Money.of(1000, 'NGN').add(Money.of(500, 'USD'))).toThrow(
      CurrencyMismatchError,
    );
  });

  it('computes a percentage in basis points', () => {
    const fee = Money.of(10_000, 'NGN').percentage(1500); // 15%
    expect(fee.amountMinor).toBe(1500);
  });

  it('multiplies by a whole-number factor', () => {
    const total = Money.of(500_000, 'NGN').multiply(3);
    expect(total.amountMinor).toBe(1_500_000);
  });

  it('rejects a non-integer minor amount', () => {
    expect(() => Money.of(10.5, 'NGN')).toThrow();
  });

  it('is equal when amount and currency match', () => {
    expect(Money.of(1000, 'NGN').equals(Money.of(1000, 'NGN'))).toBe(true);
    expect(Money.of(1000, 'NGN').equals(Money.of(1000, 'USD'))).toBe(false);
  });
});
