# Security Specification - Firestore Rules

## 1. Data Invariants
- **Players**: Every player must have a unique ID matching their Firebase Auth UID. Balance must be non-negative.
- **Transactions**: Every transaction must refer to a valid player. Amount must be positive.
- **Admin Config**: Only admins can read/write global configuration.
- **Privacy**: Players can only read their own data and their own transactions, unless they are admins.

## 2. The "Dirty Dozen" Payloads (Deny Examples)
1. Creating a player with a different UID.
2. Updating balance directly without a transaction.
3. Reading another player's profile.
4. Listing all transactions as a non-admin.
5. Deleting admin config.
6. Creating a withdrawal request with an amount greater than balance.
7. Spoofing admin status.
8. Modifying a completed transaction.
9. Injecting script tags or huge strings into names.
10. Creating orphaned transactions (no playerId).
11. Updating `createdAt` timestamp.
12. Withdrawing credit before it's deposited.

## 3. Collections and Roles
- `players/{uid}`: Owner Read/Write (limited), Admin Full.
- `transactions/{id}`: Owner Read, No User Write (System only, but in this app it's client-side batch, so we need hardened validation).
- `deposits/{id}`: Owner Read/Write (create only), Admin Read/Update.
- `withdrawals/{id}`: Owner Read/Write (create only), Admin Read/Update.
- `config/admin`: Admin Read/Write.
