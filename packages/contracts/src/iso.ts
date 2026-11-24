/**
 * ISO 3166-1 alpha-2 country and ISO 4217 currency specifications.
 */

export const ISO_COUNTRY_REGEX = /^[A-Z]{2}$/;
export const ISO_CURRENCY_REGEX = /^[A-Z]{3}$/;

export type CountryCode = string & { readonly __brand: unique symbol };
export type CurrencyCode = string & { readonly __brand: unique symbol };

export function parseCountryCode(code: string): CountryCode {
  const normalized = code.trim().toUpperCase();
  if (!ISO_COUNTRY_REGEX.test(normalized)) {
    throw new Error(`Invalid ISO 3166-1 alpha-2 country code: "${code}"`);
  }
  return normalized as CountryCode;
}

export function parseCurrencyCode(code: string): CurrencyCode {
  const normalized = code.trim().toUpperCase();
  if (!ISO_CURRENCY_REGEX.test(normalized)) {
    throw new Error(`Invalid ISO 4217 currency code: "${code}"`);
  }
  return normalized as CurrencyCode;
}
