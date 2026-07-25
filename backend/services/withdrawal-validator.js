/**
 * Validates destination crypto wallet address or payout account structure.
 */
export function validateDestinationAddress(address, network = '', method = '') {
  if (!address || typeof address !== 'string') {
    return { isValid: false, reason: 'Destination address is missing or empty.' };
  }

  const addr = address.trim();
  if (addr.length < 5) {
    return { isValid: false, reason: 'Destination address is too short.' };
  }

  const netUpper = (network || method || '').toUpperCase();

  // TRC20 / TRON Network Validation
  if (netUpper.includes('TRC20') || netUpper.includes('TRON') || netUpper === 'TRX') {
    const isTron = /^T[a-km-zA-HJ-NP-Z1-9]{33}$/.test(addr);
    if (!isTron) {
      return {
        isValid: false,
        reason: 'Invalid TRC20 TRON wallet address. TRC20 addresses must start with "T" and be exactly 34 characters long.'
      };
    }
    return { isValid: true };
  }

  // BEP20 (Binance Smart Chain) / ERC20 (Ethereum) / EVM Networks
  if (netUpper.includes('BEP20') || netUpper.includes('ERC20') || netUpper.includes('BSC') || netUpper.includes('ETH') || netUpper.includes('POLYGON')) {
    const isEvm = /^0x[a-fA-F0-9]{40}$/.test(addr);
    if (!isEvm) {
      return {
        isValid: false,
        reason: `Invalid ${netUpper} EVM wallet address. Must start with "0x" followed by 40 hexadecimal characters.`
      };
    }
    return { isValid: true };
  }

  // BTC (Bitcoin)
  if (netUpper.includes('BTC') || netUpper.includes('BITCOIN')) {
    const isBtc = /^(1|3|bc1)[a-zA-HJ-NP-Z0-9]{25,62}$/.test(addr);
    if (!isBtc) {
      return { isValid: false, reason: 'Invalid Bitcoin wallet address format.' };
    }
    return { isValid: true };
  }

  // SOL (Solana)
  if (netUpper.includes('SOL')) {
    const isSol = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
    if (!isSol) {
      return { isValid: false, reason: 'Invalid Solana wallet address format.' };
    }
    return { isValid: true };
  }

  // UPI Payment ID
  if (netUpper.includes('UPI') || netUpper.includes('INR')) {
    const isUpi = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(addr);
    if (!isUpi) {
      return { isValid: false, reason: 'Invalid UPI VPA address format (e.g., username@bank or mobile@upi).' };
    }
    return { isValid: true };
  }

  // Bank Account Validation
  if (netUpper.includes('BANK')) {
    try {
      if (addr.startsWith('{') && addr.endsWith('}')) {
        const parsed = JSON.parse(addr);
        if (!parsed.accountHolder || parsed.accountHolder.trim().length < 2) {
          return { isValid: false, reason: 'Account holder name is required.' };
        }
        if (!parsed.accountNumber || !/^\d{9,18}$/.test(parsed.accountNumber.replace(/\s+/g, ''))) {
          return { isValid: false, reason: 'Bank account number must be between 9 and 18 digits.' };
        }
        if (!parsed.ifsc || !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(parsed.ifsc.trim())) {
          return { isValid: false, reason: 'Invalid Bank IFSC Code format (e.g., SBIN0001234).' };
        }
        return { isValid: true };
      }
    } catch (e) {}

    if (addr.length < 10) {
      return { isValid: false, reason: 'Bank account details are incomplete.' };
    }
    return { isValid: true };
  }

  // Generic check for other custom methods
  if (addr.length < 8 || addr.length > 128) {
    return { isValid: false, reason: 'Wallet address length must be between 8 and 128 characters.' };
  }

  return { isValid: true };
}

/**
 * Evaluates suspicious activity and calculates a risk score (0-100).
 * Checks flags like:
 * - High withdrawal amount relative to history
 * - Brand new account requesting large withdrawal
 * - Sudden rapid withdrawal requests
 * - Large single transaction exceeding safety threshold
 */
export function evaluateWithdrawalRisk({
  amount,
  currentBalance,
  recentWithdrawals = [],
  totalDepositsAmount = 0,
  userCreatedAt = Date.now()
}) {
  let riskScore = 0;
  const flags = [];

  const numAmount = Number(amount);
  const accountAgeHours = Math.max(0, (Date.now() - userCreatedAt) / (1000 * 60 * 60));

  // 1. New Account Large Request
  if (accountAgeHours < 24 && numAmount > 500) {
    riskScore += 35;
    flags.push('NEW_ACCOUNT_LARGE_WITHDRAWAL');
  }

  // 2. High Single Amount (> 2,500 USDT)
  if (numAmount >= 2500) {
    riskScore += 25;
    flags.push('HIGH_VALUE_TRANSACTION');
  }

  // 3. Very High Single Amount (> 10,000 USDT)
  if (numAmount >= 10000) {
    riskScore += 30;
    flags.push('VERY_HIGH_VALUE_TRANSACTION');
  }

  // 4. Withdrawal exceeds total lifetime deposits by 10x
  if (totalDepositsAmount > 0 && numAmount > (totalDepositsAmount * 10) && numAmount > 1000) {
    riskScore += 20;
    flags.push('WITHDRAWAL_EXCEEDS_DEPOSITS_SIGNIFICANTLY');
  }

  // 5. Zero Lifetime Deposits
  if (totalDepositsAmount <= 0 && numAmount > 100) {
    riskScore += 25;
    flags.push('NO_RECORDED_DEPOSITS');
  }

  // 6. Rapid consecutive withdrawals
  const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recent24hCount = recentWithdrawals.filter(w => (w.timestamp || w.createdAt) > twentyFourHoursAgo).length;

  if (recent24hCount >= 5) {
    riskScore += 30;
    flags.push('FREQUENT_24H_WITHDRAWALS');
  }

  const cappedRiskScore = Math.min(100, riskScore);
  const requiresManualApproval = cappedRiskScore >= 50;

  return {
    riskScore: cappedRiskScore,
    flags,
    requiresManualApproval
  };
}
