export class CurrencyMismatchError extends Error {
  constructor(a: string, b: string) {
    super(`Cannot operate on money in different currencies: ${a} vs ${b}`);
  }
}

/**
 * Always stored as an integer minor unit (kobo, cents) to avoid floating
 * point drift in money math -- the same reason every real payments system
 * does this.
 */
export class Money {
  private constructor(
    public readonly amountMinor: number,
    public readonly currency: string,
  ) {
    if (!Number.isInteger(amountMinor)) {
      throw new Error('Money amount must be an integer minor unit');
    }
  }

  static of(amountMinor: number, currency: string): Money {
    return new Money(amountMinor, currency);
  }

  static zero(currency: string): Money {
    return new Money(0, currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountMinor + other.amountMinor, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountMinor - other.amountMinor, this.currency);
  }

  percentage(basisPoints: number): Money {
    return new Money(
      Math.round((this.amountMinor * basisPoints) / 10_000),
      this.currency,
    );
  }

  multiply(factor: number): Money {
    return new Money(Math.round(this.amountMinor * factor), this.currency);
  }

  isNegative(): boolean {
    return this.amountMinor < 0;
  }

  equals(other: Money): boolean {
    return (
      this.amountMinor === other.amountMinor && this.currency === other.currency
    );
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }
}
