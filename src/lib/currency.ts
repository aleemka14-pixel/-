export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
  locale: string;
  flag: string;
}

export const SUPPORTED_CURRENCIES: Record<string, CurrencyInfo> = {
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', locale: 'en-US', flag: '🇺🇸' },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', locale: 'de-DE', flag: '🇪🇺' },
  JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen', locale: 'ja-JP', flag: '🇯🇵' },
  INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee', locale: 'en-IN', flag: '🇮🇳' },
  CAD: { code: 'CAD', symbol: '$', name: 'Canadian Dollar', locale: 'en-CA', flag: '🇨🇦' },
  CNY: { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', locale: 'zh-CN', flag: '🇨🇳' },
  IDR: { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah', locale: 'id-ID', flag: '🇮🇩' },
  KRW: { code: 'KRW', symbol: '₩', name: 'South Korean Won', locale: 'ko-KR', flag: '🇰🇷' },
  PHP: { code: 'PHP', symbol: '₱', name: 'Philippine Peso', locale: 'en-PH', flag: '🇵🇭' },
  RUB: { code: 'RUB', symbol: '₽', name: 'Russian Ruble', locale: 'ru-RU', flag: '🇷🇺' },
  MXN: { code: 'MXN', symbol: '$', name: 'Mexican Peso', locale: 'es-MX', flag: '🇲🇽' },
  PLN: { code: 'PLN', symbol: 'zł', name: 'Polish Zloty', locale: 'pl-PL', flag: '🇵🇱' },
  TRY: { code: 'TRY', symbol: '₺', name: 'Turkish Lira', locale: 'tr-TR', flag: '🇹🇷' },
  VND: { code: 'VND', symbol: '₫', name: 'Vietnamese Dong', locale: 'vi-VN', flag: '🇻🇳' },
  ARS: { code: 'ARS', symbol: '$', name: 'Argentine Peso', locale: 'es-AR', flag: '🇦🇷' },
  PEN: { code: 'PEN', symbol: 'S/.', name: 'Peruvian Sol', locale: 'es-PE', flag: '🇵🇪' },
  CLP: { code: 'CLP', symbol: '$', name: 'Chilean Peso', locale: 'es-CL', flag: '🇨🇱' },
  NGN: { code: 'NGN', symbol: '₦', name: 'Nigerian Naira', locale: 'en-NG', flag: '🇳🇬' },
  AED: { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', locale: 'ar-AE', flag: '🇦🇪' },
  BHD: { code: 'BHD', symbol: '.د.ب', name: 'Bahraini Dinar', locale: 'ar-BH', flag: '🇧🇭' },
  CRC: { code: 'CRC', symbol: '₡', name: 'Costa Rican Colón', locale: 'es-CR', flag: '🇨🇷' },
  KWD: { code: 'KWD', symbol: 'د.ك', name: 'Kuwaiti Dinar', locale: 'ar-KW', flag: '🇰🇼' },
  MAD: { code: 'MAD', symbol: 'د.م.', name: 'Moroccan Dirham', locale: 'ar-MA', flag: '🇲🇦' },
  MYR: { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit', locale: 'ms-MY', flag: '🇲🇾' },
  QAR: { code: 'QAR', symbol: 'ر.ق', name: 'Qatari Riyal', locale: 'ar-QA', flag: '🇶🇦' },
  SAR: { code: 'SAR', symbol: 'ر.س', name: 'Saudi Riyal', locale: 'ar-SA', flag: '🇸🇦' },
  SGD: { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', locale: 'en-SG', flag: '🇸🇬' },
  TND: { code: 'TND', symbol: 'د.ت', name: 'Tunisian Dinar', locale: 'ar-TN', flag: '🇹🇳' },
  TWD: { code: 'TWD', symbol: 'NT$', name: 'New Taiwan Dollar', locale: 'zh-TW', flag: '🇹🇼' },
  GHS: { code: 'GHS', symbol: '₵', name: 'Ghanaian Cedi', locale: 'en-GH', flag: '🇬🇭' },
  KES: { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling', locale: 'sw-KE', flag: '🇰🇪' },
  BOB: { code: 'BOB', symbol: 'Bs.', name: 'Bolivian Boliviano', locale: 'es-BO', flag: '🇧🇴' },
  XOF: { code: 'XOF', symbol: 'CFA', name: 'West African CFA Franc', locale: 'fr-SN', flag: 'XOF' },
  PKR: { code: 'PKR', symbol: '₨', name: 'Pakistani Rupee', locale: 'en-PK', flag: '🇵🇰' },
  NZD: { code: 'NZD', symbol: '$', name: 'New Zealand Dollar', locale: 'en-NZ', flag: '🇳🇿' },
  ISK: { code: 'ISK', symbol: 'kr', name: 'Icelandic Króna', locale: 'is-IS', flag: '🇮🇸' },
  BAM: { code: 'BAM', symbol: 'KM', name: 'Bosnia-Herzegovina Convertible Mark', locale: 'bs-BA', flag: '🇧🇦' },
  TZS: { code: 'TZS', symbol: 'TSh', name: 'Tanzanian Shilling', locale: 'sw-TZ', flag: '🇹🇿' },
  EGP: { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound', locale: 'ar-EG', flag: '🇪🇬' },
  LKR: { code: 'LKR', symbol: 'Rs', name: 'Sri Lankan Rupee', locale: 'si-LK', flag: '🇱🇰' },
  UGX: { code: 'UGX', symbol: 'USh', name: 'Ugandan Shilling', locale: 'en-UG', flag: '🇺🇬' },
  KZT: { code: 'KZT', symbol: '₸', name: 'Kazakhstani Tenge', locale: 'kk-KZ', flag: '🇰🇿' },
  BDT: { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka', locale: 'bn-BD', flag: '🇧🇩' },
  UAH: { code: 'UAH', symbol: '₴', name: 'Ukrainian Hryvnia', locale: 'uk-UA', flag: '🇺🇦' },
  GEL: { code: 'GEL', symbol: '₾', name: 'Georgian Lari', locale: 'ka-GE', flag: '🇬🇪' },
  MNT: { code: 'MNT', symbol: '₮', name: 'Mongolian Tögrög', locale: 'mn-MN', flag: '🇲🇳' },
  GTQ: { code: 'GTQ', symbol: 'Q', name: 'Guatemalan Quetzal', locale: 'es-GT', flag: '🇬🇹' },
  KGS: { code: 'KGS', symbol: 'лв', name: 'Kyrgystani Som', locale: 'ky-KG', flag: '🇰🇬' },
  ZAR: { code: 'ZAR', symbol: 'R', name: 'South African Rand', locale: 'en-ZA', flag: '🇿🇦' },
  TMT: { code: 'TMT', symbol: 'T', name: 'Turkmenistani Manat', locale: 'tk-TM', flag: '🇹🇲' },
  ZMW: { code: 'ZMW', symbol: 'ZK', name: 'Zambian Kwacha', locale: 'en-ZM', flag: '🇿🇲' },
  TJS: { code: 'TJS', symbol: 'ЅМ', name: 'Tajikistani Somoni', locale: 'tg-TJ', flag: '🇹🇯' },
  MRU: { code: 'MRU', symbol: 'UM', name: 'Mauritanian Ouguiya', locale: 'ar-MR', flag: '🇲🇷' },
  TTD: { code: 'TTD', symbol: 'TT$', name: 'Trinidad and Tobago Dollar', locale: 'en-TT', flag: '🇹🇹' },
  GMD: { code: 'GMD', symbol: 'D', name: 'Gambian Dalasi', locale: 'en-GM', flag: '🇬🇲' },
  MGA: { code: 'MGA', symbol: 'Ar', name: 'Malagasy Ariary', locale: 'mg-MG', flag: '🇲🇬' },
  JMD: { code: 'JMD', symbol: 'J$', name: 'Jamaican Dollar', locale: 'en-JM', flag: '🇯🇲' },
  NIO: { code: 'NIO', symbol: 'C$', name: 'Nicaraguan Córdoba', locale: 'es-NI', flag: '🇳🇮' },
  HNL: { code: 'HNL', symbol: 'L', name: 'Honduran Lempira', locale: 'es-HN', flag: '🇭🇳' },
  MZN: { code: 'MZN', symbol: 'MT', name: 'Mozambican Metical', locale: 'pt-MZ', flag: '🇲🇿' },
  XAF: { code: 'XAF', symbol: 'FCFA', name: 'Central African CFA Franc', locale: 'fr-CM', flag: 'XAF' },
  RWF: { code: 'RWF', symbol: 'FRw', name: 'Rwandan Franc', locale: 'rw-RW', flag: '🇷🇼' },
  GNF: { code: 'GNF', symbol: 'FG', name: 'Guinean Franc', locale: 'fr-GN', flag: '🇬🇳' },
  BWP: { code: 'BWP', symbol: 'P', name: 'Botswanan Pula', locale: 'en-BW', flag: '🇧🇼' },
  KMF: { code: 'KMF', symbol: 'CF', name: 'Comorian Franc', locale: 'ar-KM', flag: '🇰🇲' },
  LSL: { code: 'LSL', symbol: 'L', name: 'Lesotho Loti', locale: 'en-LS', flag: '🇱🇸' },
  ERN: { code: 'ERN', symbol: 'Nfk', name: 'Eritrean Nakfa', locale: 'ti-ER', flag: '🇪🇷' },
  BIF: { code: 'BIF', symbol: 'FBu', name: 'Burundian Franc', locale: 'rn-BI', flag: '🇧🇮' },
  MWK: { code: 'MWK', symbol: 'MK', name: 'Malawian Kwacha', locale: 'en-MW', flag: '🇲🇼' },
  PGK: { code: 'PGK', symbol: 'K', name: 'Papua New Guinean Kina', locale: 'en-PG', flag: '🇵🇬' }
};

export const DEFAULT_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 0.92,
  JPY: 161.0,
  INR: 83.50,
  CAD: 1.36,
  CNY: 7.27,
  IDR: 16300,
  KRW: 1380,
  PHP: 58.50,
  RUB: 88.00,
  MXN: 18.00,
  PLN: 4.00,
  TRY: 32.80,
  VND: 25400,
  ARS: 915.00,
  PEN: 3.80,
  CLP: 935.00,
  NGN: 1500.00,
  AED: 3.67,
  BHD: 0.377,
  CRC: 525.00,
  KWD: 0.307,
  MAD: 10.00,
  MYR: 4.70,
  QAR: 3.64,
  SAR: 3.75,
  SGD: 1.35,
  TND: 3.10,
  TWD: 32.50,
  GHS: 15.00,
  KES: 129.00,
  BOB: 6.90,
  XOF: 605.00,
  PKR: 278.50,
  NZD: 1.63,
  ISK: 139.00,
  BAM: 1.80,
  TZS: 2600.00,
  EGP: 48.00,
  LKR: 303.00,
  UGX: 3720.00,
  KZT: 475.00,
  BDT: 117.00,
  UAH: 40.50,
  GEL: 2.70,
  MNT: 3450.00,
  GTQ: 7.75,
  KGS: 87.00,
  ZAR: 18.20,
  TMT: 3.50,
  ZMW: 25.50,
  TJS: 10.60,
  MRU: 39.50,
  TTD: 6.75,
  GMD: 68.50,
  MGA: 4500.00,
  JMD: 156.00,
  NIO: 36.80,
  HNL: 24.70,
  MZN: 63.80,
  XAF: 605.00,
  RWF: 1310.00,
  GNF: 8600.00,
  BWP: 13.50,
  KMF: 453.00,
  LSL: 18.20,
  ERN: 15.00,
  BIF: 2870.00,
  MWK: 1730.00,
  PGK: 3.90
};

export function getCachedRates(): { rates: Record<string, number>; lastUpdated: number } {
  try {
    const cachedRatesStr = localStorage.getItem('cached_exchange_rates');
    const lastUpdateStr = localStorage.getItem('last_exchange_rate_update');
    
    if (cachedRatesStr && lastUpdateStr) {
      const rates = JSON.parse(cachedRatesStr);
      const lastUpdated = parseInt(lastUpdateStr, 10);
      if (rates && typeof rates === 'object' && !isNaN(lastUpdated)) {
        return { rates, lastUpdated };
      }
    }
  } catch (e) {
    console.error('Failed to parse cached exchange rates:', e);
  }
  return { rates: DEFAULT_RATES, lastUpdated: 0 };
}

export function setCachedRates(rates: Record<string, number>, timestamp: number): void {
  try {
    localStorage.setItem('cached_exchange_rates', JSON.stringify(rates));
    localStorage.setItem('last_exchange_rate_update', timestamp.toString());
  } catch (e) {
    console.error('Failed to cache exchange rates:', e);
  }
}

export async function fetchExchangeRates(): Promise<Record<string, number>> {
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }
    const data = await response.json();
    if (data && data.rates) {
      return data.rates;
    }
    throw new Error('Invalid format returned by exchange rate API');
  } catch (err) {
    console.error('Failed fetching exchange rates from live API:', err);
    throw err;
  }
}

export function convertUsdToCurrency(
  amountInUsd: number,
  targetCurrency: string,
  rates: Record<string, number>
): number {
  const rate = rates[targetCurrency] || DEFAULT_RATES[targetCurrency] || 1;
  return amountInUsd * rate;
}

export function convertCurrencyToUsd(
  amountInForeign: number,
  sourceCurrency: string,
  rates: Record<string, number>
): number {
  const rate = rates[sourceCurrency] || DEFAULT_RATES[sourceCurrency] || 1;
  return amountInForeign / rate;
}

export function formatCurrencyValue(
  amountInUsd: number,
  targetCurrency: string,
  rates: Record<string, number>
): string {
  const currency = SUPPORTED_CURRENCIES[targetCurrency] || SUPPORTED_CURRENCIES.USD;
  const converted = convertUsdToCurrency(amountInUsd, currency.code, rates);
  
  return converted.toLocaleString(currency.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function getCurrencySymbol(currencyCode: string): string {
  return SUPPORTED_CURRENCIES[currencyCode]?.symbol || '$';
}
