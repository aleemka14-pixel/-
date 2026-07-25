/**
 * Utility functions for withdrawal methods, masking, encryption/obfuscation,
 * IFSC bank lookup, and address validation.
 */

// Simple XOR + Base64 obfuscation for local storage security
const SECRET_SALT = 'ais_withdraw_sec_2026';

export function encryptSavedData(data: object): string {
  try {
    const jsonStr = JSON.stringify(data);
    let result = '';
    for (let i = 0; i < jsonStr.length; i++) {
      const charCode = jsonStr.charCodeAt(i) ^ SECRET_SALT.charCodeAt(i % SECRET_SALT.length);
      result += String.fromCharCode(charCode);
    }
    return btoa(result);
  } catch (e) {
    console.error("Encryption error:", e);
    return '';
  }
}

export function decryptSavedData<T>(encodedStr: string): T | null {
  if (!encodedStr) return null;
  try {
    const decoded = atob(encodedStr);
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
      const charCode = decoded.charCodeAt(i) ^ SECRET_SALT.charCodeAt(i % SECRET_SALT.length);
      result += String.fromCharCode(charCode);
    }
    return JSON.parse(result) as T;
  } catch (e) {
    // Fallback for plain unencrypted legacy stored data
    try {
      return JSON.parse(encodedStr) as T;
    } catch (err) {
      return null;
    }
  }
}

// Security Masking Functions
export function maskCryptoAddress(address: string): string {
  if (!address) return '';
  const clean = address.trim();
  if (clean.length <= 10) return clean;
  return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
}

export function maskUpiId(upi: string): string {
  if (!upi || !upi.includes('@')) return upi;
  const [username, handle] = upi.split('@');
  if (username.length <= 2) return `${username}***@${handle}`;
  return `${username.slice(0, 2)}${'*'.repeat(Math.max(2, username.length - 3))}${username.slice(-1)}@${handle}`;
}

export function maskBankAccountNumber(accNo: string): string {
  if (!accNo) return '';
  const clean = accNo.replace(/\s+/g, '');
  if (clean.length <= 4) return clean;
  return `•••• •••• ${clean.slice(-4)}`;
}

/**
 * Returns formatted masked destination based on method type
 */
export function formatMaskedDestination(details: string, method?: string, network?: string): string {
  if (!details) return 'N/A';
  
  const metUpper = (method || network || '').toUpperCase();

  // Handle Bank Account JSON or string
  if (metUpper.includes('BANK') || details.includes('IFSC') || details.startsWith('{')) {
    try {
      if (details.startsWith('{')) {
        const parsed = JSON.parse(details);
        const bankName = parsed.bankName || lookupBankFromIFSC(parsed.ifsc) || 'Bank Account';
        const maskedAcc = maskBankAccountNumber(parsed.accountNumber || '');
        return `${bankName} (${maskedAcc})`;
      }
    } catch (e) {}

    const accMatch = details.match(/\b\d{9,18}\b/);
    if (accMatch) {
      return `Bank Account (${maskBankAccountNumber(accMatch[0])})`;
    }
    return 'Bank Account';
  }

  // Handle UPI
  if (metUpper.includes('UPI') || details.includes('@')) {
    const upiMatch = details.match(/[a-zA-Z0-9.\-_]+@[a-zA-Z]+/);
    if (upiMatch) {
      return `UPI (${maskUpiId(upiMatch[0])})`;
    }
    return `UPI (${maskUpiId(details)})`;
  }

  // Handle Crypto
  return maskCryptoAddress(details);
}

/**
 * IFSC Bank Name Auto Lookup
 */
export function lookupBankFromIFSC(ifsc: string): string {
  if (!ifsc || ifsc.length < 4) return '';
  const prefix = ifsc.substring(0, 4).toUpperCase();
  const bankMap: Record<string, string> = {
    SBIN: 'State Bank of India',
    HDFC: 'HDFC Bank',
    ICIC: 'ICICI Bank',
    UTIB: 'Axis Bank',
    KKBK: 'Kotak Mahindra Bank',
    PUNB: 'Punjab National Bank',
    BARB: 'Bank of Baroda',
    CNRB: 'Canara Bank',
    YESB: 'Yes Bank',
    INDB: 'IndusInd Bank',
    UBIN: 'Union Bank of India',
    IDIB: 'Indian Bank',
    MAHB: 'Bank of Maharashtra',
    IOBA: 'Indian Overseas Bank',
    CITI: 'Citibank',
    HSBC: 'HSBC Bank',
    SCBL: 'Standard Chartered Bank',
    PAYT: 'Paytm Payments Bank',
    AIRP: 'Airtel Payments Bank',
    FINO: 'Fino Payments Bank',
    JIOB: 'Jio Payments Bank',
    DBSS: 'DBS Bank India',
    ESFB: 'Equitas Small Finance Bank',
    AUBL: 'AU Small Finance Bank',
    BAND: 'Bandhan Bank',
    IDFB: 'IDFC FIRST Bank',
    KARB: 'Karnataka Bank',
    FEDERAL: 'Federal Bank',
    FDRL: 'Federal Bank',
    CSBK: 'CSB Bank',
    KVBL: 'Karur Vysya Bank',
    TMBL: 'Tamilnad Mercantile Bank',
    SIBL: 'South Indian Bank'
  };
  return bankMap[prefix] || '';
}

/**
 * Format validation for UPI
 */
export function validateUpiFormat(upi: string): { isValid: boolean; error?: string } {
  if (!upi || !upi.trim()) {
    return { isValid: false, error: 'UPI ID is required.' };
  }
  const clean = upi.trim();
  const regex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
  if (!regex.test(clean)) {
    return { isValid: false, error: 'Invalid UPI ID format. Example: user@upi or mobile@paytm.' };
  }
  return { isValid: true };
}

/**
 * Format validation for Bank Account details
 */
export function validateBankDetails(holder: string, accNo: string, confirmAccNo: string, ifsc: string): { isValid: boolean; error?: string } {
  if (!holder || !holder.trim() || holder.trim().length < 2) {
    return { isValid: false, error: 'Account holder name must be at least 2 characters.' };
  }
  const cleanAcc = accNo.replace(/\s+/g, '');
  const cleanConfirm = confirmAccNo.replace(/\s+/g, '');
  
  if (!cleanAcc || !/^\d{9,18}$/.test(cleanAcc)) {
    return { isValid: false, error: 'Account number must contain between 9 and 18 digits.' };
  }
  if (cleanAcc !== cleanConfirm) {
    return { isValid: false, error: 'Account numbers do not match.' };
  }
  const cleanIfsc = ifsc.trim().toUpperCase();
  if (!cleanIfsc || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
    return { isValid: false, error: 'Invalid IFSC code format (e.g., SBIN0001234).' };
  }
  return { isValid: true };
}
