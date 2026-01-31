// src/sanitizer.ts
// Personal information redaction for email exports

import { ADDRESS_PATTERNS, CITY_PATTERNS } from './address-detector.js';

export type RedactionCategory =
    // Security/Privacy - ON by default
    | 'credit_cards'
    | 'bank_accounts'
    | 'tax_ids'
    | 'passwords'
    | 'api_keys'
    | 'otp_codes'
    | 'phone_numbers'
    | 'physical_addresses'
    | 'ip_addresses'
    | 'government_ids'
    | 'token_urls'
    | 'case_numbers'
    | 'claim_numbers'
    | 'auth_codes'
    | 'device_ids'
    | 'employee_ids'
    // Identity/PII - ON by default
    | 'dates_of_birth'
    | 'ages'
    | 'member_ids'
    | 'vehicle_ids'
    | 'medical_ids'
    // Optional - OFF by default (useful for analysis)
    | 'email_addresses'
    | 'order_numbers'
    | 'tracking_numbers'
    | 'booking_references'
    | 'financial_amounts'
    | 'regular_urls';

export interface RedactionPattern {
    category: RedactionCategory;
    name: string;
    description: string;
    patterns: RegExp[];
    replacement: string;
}

export const REDACTION_CATEGORIES: Record<RedactionCategory, { name: string; description: string; default: boolean }> = {
    // ═══════════════════════════════════════════════════════════════════
    // SECURITY/PRIVACY - ON by default
    // ═══════════════════════════════════════════════════════════════════
    credit_cards: {
        name: 'Credit/Debit Cards',
        description: 'Visa, Mastercard, Amex, Discover card numbers',
        default: true,
    },
    bank_accounts: {
        name: 'Bank Accounts',
        description: 'Bank account numbers, routing numbers, IBAN',
        default: true,
    },
    tax_ids: {
        name: 'Tax IDs',
        description: 'SSN, EIN, TIN, and international tax IDs',
        default: true,
    },
    passwords: {
        name: 'Passwords',
        description: 'Passwords, PINs, and security credentials',
        default: true,
    },
    api_keys: {
        name: 'API Keys & Tokens',
        description: 'API keys, access tokens, secret keys',
        default: true,
    },
    otp_codes: {
        name: 'Verification Codes',
        description: '2FA codes, OTPs, verification codes',
        default: true,
    },
    phone_numbers: {
        name: 'Phone Numbers',
        description: 'Phone numbers in various formats',
        default: true,
    },
    physical_addresses: {
        name: 'Physical Addresses',
        description: 'Street addresses and postal codes',
        default: true,
    },
    ip_addresses: {
        name: 'IP Addresses',
        description: 'IPv4 and IPv6 addresses',
        default: true,
    },
    government_ids: {
        name: 'Government IDs',
        description: 'Passport, driver\'s license, national ID numbers',
        default: true,
    },
    token_urls: {
        name: 'URLs with Tokens',
        description: 'Password reset links, unsubscribe links, tracking URLs',
        default: true,
    },
    case_numbers: {
        name: 'Case/Ticket Numbers',
        description: 'Support case numbers, ticket IDs, incident numbers',
        default: true,
    },
    claim_numbers: {
        name: 'Claim Numbers',
        description: 'Insurance claims, warranty claims, dispute IDs',
        default: true,
    },
    auth_codes: {
        name: 'Authorization Codes',
        description: 'Transaction auth codes, approval codes',
        default: true,
    },
    device_ids: {
        name: 'Device IDs',
        description: 'Device identifiers, hardware IDs',
        default: true,
    },
    employee_ids: {
        name: 'Employee/Student IDs',
        description: 'Employee ID numbers, student IDs',
        default: true,
    },

    // ═══════════════════════════════════════════════════════════════════
    // PII - ON by default (identifiable personal information)
    // ═══════════════════════════════════════════════════════════════════
    dates_of_birth: {
        name: 'Dates of Birth',
        description: 'Birth dates and DOB references',
        default: true,
    },
    ages: {
        name: 'Ages',
        description: 'Specific age mentions (e.g., "I am 34 years old")',
        default: true,
    },
    member_ids: {
        name: 'Member/Loyalty IDs',
        description: 'Membership numbers, loyalty program IDs, customer IDs',
        default: true,
    },
    vehicle_ids: {
        name: 'Vehicle IDs',
        description: 'License plates, VIN numbers',
        default: true,
    },
    medical_ids: {
        name: 'Medical IDs',
        description: 'Medical record numbers, insurance IDs, prescription numbers',
        default: true,
    },

    // ═══════════════════════════════════════════════════════════════════
    // OPTIONAL - OFF by default (often useful for analysis)
    // ═══════════════════════════════════════════════════════════════════
    email_addresses: {
        name: 'Email Addresses (in body)',
        description: 'Email addresses mentioned in email body text',
        default: false,
    },
    order_numbers: {
        name: 'Order Numbers',
        description: 'Order IDs, confirmation numbers, invoice numbers',
        default: false,
    },
    tracking_numbers: {
        name: 'Tracking Numbers',
        description: 'Package tracking numbers (UPS, FedEx, USPS, etc.)',
        default: false,
    },
    booking_references: {
        name: 'Booking References',
        description: 'Flight, hotel, and travel confirmation codes',
        default: false,
    },
    financial_amounts: {
        name: 'Financial Amounts',
        description: 'Dollar amounts, prices, balances, payments',
        default: false,
    },
    regular_urls: {
        name: 'All URLs',
        description: 'All URLs (not just those with tokens)',
        default: false,
    },
};

export const ALL_REDACTION_CATEGORIES = Object.keys(REDACTION_CATEGORIES) as RedactionCategory[];

export const DEFAULT_REDACTION_CATEGORIES = ALL_REDACTION_CATEGORIES.filter(
    (cat) => REDACTION_CATEGORIES[cat].default
);

const PATTERNS: RedactionPattern[] = [
    // ════════════════════════════════════════════════════════════════════
    // FINANCIAL
    // ════════════════════════════════════════════════════════════════════
    {
        category: 'credit_cards',
        name: 'Credit Card Numbers',
        description: 'Visa, Mastercard, Amex, Discover, and other card numbers',
        patterns: [
            // Visa: starts with 4, 16 digits
            /\b4[0-9]{3}[\s\-]?[0-9]{4}[\s\-]?[0-9]{4}[\s\-]?[0-9]{4}\b/g,
            // Mastercard: starts with 5[1-5] or 2[2-7], 16 digits
            /\b(?:5[1-5][0-9]{2}|2[2-7][0-9]{2})[\s\-]?[0-9]{4}[\s\-]?[0-9]{4}[\s\-]?[0-9]{4}\b/g,
            // Amex: starts with 34 or 37, 15 digits
            /\b3[47][0-9]{2}[\s\-]?[0-9]{6}[\s\-]?[0-9]{5}\b/g,
            // Discover: starts with 6011, 6[44-49], 65, 16 digits
            /\b6(?:011|5[0-9]{2}|4[4-9][0-9])[\s\-]?[0-9]{4}[\s\-]?[0-9]{4}[\s\-]?[0-9]{4}\b/g,
            // Generic 16-digit card pattern with separators
            /\b[0-9]{4}[\s\-][0-9]{4}[\s\-][0-9]{4}[\s\-][0-9]{4}\b/g,
            // Card ending in XXXX pattern
            /\b(?:card|ending|ends|last\s*4)(?:\s+(?:in|digits?|number)?:?\s*)[0-9]{4}\b/gi,
            // Masked card numbers: ...1234, ***1234, ****1234, xx1234, XXXX1234
            /\.{2,}[0-9]{4}\b/g,
            /\*{2,}[0-9]{4}\b/g,
            /[xX]{2,}[0-9]{4}\b/g,
            // Masked with parentheses: (...1234)
            /\(\.\.\.[0-9]{4}\)/g,
            // Longer masked patterns: ************1234
            /[\*xX]{4,}[0-9]{4}\b/gi,
            // "Your PRONTO card 00000165253200929291" or "Your card 12345678"
            /\b(?:your|my|the)\s+(?:\w+\s+)?card\s+[0-9]{8,20}\b/gi,
            // "Card Number: 00000202142394429291"
            /\bcard\s*(?:#|number|no\.?)?:?\s*[0-9]{8,20}\b/gi,
            // "Control number: 9233092843182617"
            /\bcontrol\s*(?:#|number|no\.?)?:?\s*[0-9]{8,20}\b/gi,
            // "Agreement Number: 278474585774" or "Plan Agreement Number"
            /\b(?:\w+\s+)?agreement\s*(?:#|number|no\.?)?:?\s*[0-9]{8,20}\b/gi,
            // Generic "number: XXXXXXXX" with 8+ digits
            /\bnumber:?\s*[0-9]{8,20}\b/gi,
        ],
        replacement: '[REDACTED_CARD]',
    },
    {
        category: 'bank_accounts',
        name: 'Bank Account Numbers',
        description: 'Account numbers, routing numbers, IBAN',
        patterns: [
            // US routing number (9 digits)
            /\b(?:routing|aba|transit)(?:\s*(?:#|number|no\.?)?:?\s*)[0-9]{9}\b/gi,
            // Account number with context
            /\b(?:account|acct)(?:\s*(?:#|number|no\.?)?:?\s*)[0-9]{6,17}\b/gi,
            // IBAN (international)
            /\b[A-Z]{2}[0-9]{2}[\s]?[A-Z0-9]{4}[\s]?[0-9]{4}[\s]?[0-9]{4}[\s]?[0-9]{4}[\s]?[0-9]{0,4}\b/g,
            // SWIFT/BIC codes
            /\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g,
        ],
        replacement: '[REDACTED_BANK]',
    },
    {
        category: 'tax_ids',
        name: 'Tax IDs',
        description: 'SSN, EIN, ITIN, international tax IDs',
        patterns: [
            // US SSN: XXX-XX-XXXX
            /\b[0-9]{3}[\s\-][0-9]{2}[\s\-][0-9]{4}\b/g,
            // US EIN: XX-XXXXXXX
            /\b[0-9]{2}[\s\-][0-9]{7}\b/g,
            // SSN with context (even without dashes)
            /\b(?:ssn|social\s*security|tin|tax\s*id|ein|itin)(?:\s*(?:#|number|no\.?)?:?\s*)[0-9\-\s]{9,11}\b/gi,
            // Canada SIN: XXX-XXX-XXX
            /\b[0-9]{3}[\s\-][0-9]{3}[\s\-][0-9]{3}\b/g,
            // UK National Insurance: AB123456C
            /\b[A-Z]{2}[0-9]{6}[A-Z]\b/g,
            // Australia TFN: XXX XXX XXX
            /\b(?:tfn|tax\s*file)(?:\s*(?:#|number|no\.?)?:?\s*)[0-9]{3}[\s]?[0-9]{3}[\s]?[0-9]{3}\b/gi,
        ],
        replacement: '[REDACTED_TAX_ID]',
    },

    // ════════════════════════════════════════════════════════════════════
    // AUTHENTICATION
    // ════════════════════════════════════════════════════════════════════
    {
        category: 'passwords',
        name: 'Passwords',
        description: 'Passwords and PINs',
        patterns: [
            // Password with context
            /\b(?:password|passwd|pwd|pin|passcode|secret)(?:\s*(?:is|was|:)\s*)["']?[^\s"']{4,50}["']?/gi,
            // Temporary password patterns
            /\b(?:temporary|temp|new|initial|default)\s+(?:password|pwd|pin)(?:\s*(?:is|was|:)\s*)["']?[^\s"']{4,50}["']?/gi,
            // Your password is: pattern
            /(?:your|the)\s+(?:password|pin|passcode)\s+(?:is|was|:)\s*["']?[^\s"'\n]{4,50}["']?/gi,
        ],
        replacement: '[REDACTED_PASSWORD]',
    },
    {
        category: 'api_keys',
        name: 'API Keys',
        description: 'API keys and tokens from various services',
        patterns: [
            // AWS Access Key
            /\b(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}\b/g,
            // AWS Secret Key (40 chars base64-ish)
            /\b(?:aws[_\-]?secret|secret[_\-]?key)["']?\s*[:=]\s*["']?[A-Za-z0-9\/+=]{40}["']?/gi,
            // Google API Key
            /\bAIza[A-Za-z0-9_-]{35}\b/g,
            // Stripe keys
            /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{24,}\b/g,
            // GitHub tokens
            /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g,
            // Slack tokens
            /\bxox[baprs]-[A-Za-z0-9\-]{10,}\b/g,
            // Generic API key with context
            /\b(?:api[_\-]?key|apikey|access[_\-]?token|auth[_\-]?token|bearer)["']?\s*[:=]\s*["']?[A-Za-z0-9_\-]{20,}["']?/gi,
            // Bearer tokens
            /\bBearer\s+[A-Za-z0-9_\-\.]+/g,
            // JWT tokens (simplified)
            /\beyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g,
        ],
        replacement: '[REDACTED_API_KEY]',
    },
    {
        category: 'otp_codes',
        name: 'OTP/Verification Codes',
        description: 'One-time passwords and verification codes',
        patterns: [
            // "verification code is: 123456" or "verification code: 123456"
            /\b(?:verification|confirmation|security|authentication|otp)\s+code\s*(?:is|was)?:?\s*[0-9]{4,8}\b/gi,
            // "one-time code...123456" or "one time code is 123456" or "This one-time code...169243"
            /\bone[\s\-]?time\s+(?:code|password|passcode)[^0-9]*[0-9]{4,8}\b/gi,
            // "code is only valid...169243" - code at end after colon
            /\bcode\s+(?:is\s+)?(?:only\s+)?valid[^0-9]*[0-9]{4,8}\b/gi,
            // "Your code is: 123456" or "Your code: 123456"
            /\b(?:your|the)\s+(?:code|pin|otp|passcode)\s*(?:is|was)?:?\s*[0-9]{4,8}\b/gi,
            // "code is: 123456" or "code: 123456" standalone
            /\bcode\s*(?:is|was)?:?\s*[0-9]{4,8}\b/gi,
            // "PIN: 1234" or "OTP: 123456"
            /\b(?:pin|otp)\s*:?\s*[0-9]{4,8}\b/gi,
            // 2FA/MFA codes
            /\b(?:2fa|two[\s\-]?factor|mfa)\s*(?:code)?\s*(?:is|was)?:?\s*[0-9]{4,8}\b/gi,
            // "Enter 123456" or "enter code 123456"
            /\benter\s+(?:code\s+)?[0-9]{4,8}\b/gi,
            // Just a 6-digit number after "is:" or "is :"
            /\bis\s*:\s*[0-9]{6}\b/gi,
            // "valid for X minutes: 123456" pattern
            /\bvalid\s+(?:for\s+)?[0-9]+\s*(?:minutes?|mins?|hours?|hrs?)[^0-9]*[0-9]{4,8}\b/gi,
        ],
        replacement: '[REDACTED_CODE]',
    },

    // ════════════════════════════════════════════════════════════════════
    // CONTACT INFORMATION
    // ════════════════════════════════════════════════════════════════════
    {
        category: 'phone_numbers',
        name: 'Phone Numbers',
        description: 'Phone numbers in various international formats',
        patterns: [
            // +1XXXXXXXXXX format (no separators)
            /\+1[0-9]{10}\b/g,
            // US/Canada: (XXX) XXX-XXXX, XXX-XXX-XXXX, XXX.XXX.XXXX
            /\b(?:\+?1[\s\-\.]?)?\(?[0-9]{3}\)?[\s\-\.][0-9]{3}[\s\-\.][0-9]{4}\b/g,
            // 10-digit US number without separators
            /\b[2-9][0-9]{2}[2-9][0-9]{6}\b/g,
            // International with + prefix (with separators)
            /\+[0-9]{1,3}[\s\-\.][0-9]{1,4}[\s\-\.][0-9]{1,4}[\s\-\.][0-9]{1,4}[\s\-\.]?[0-9]{0,4}\b/g,
            // International without separators: +XXXXXXXXXXX (11-15 digits)
            /\+[0-9]{11,15}\b/g,
            // UK: +44 XXXX XXXXXX or 0XXXX XXXXXX
            /\b(?:\+44|0)[\s\-\.]?[0-9]{4}[\s\-\.]?[0-9]{6}\b/g,
            // Phone with context
            /\b(?:phone|tel|mobile|cell|fax|call)(?:\s*(?:#|number|no\.?)?:?\s*)[\+]?[0-9\s\-\.\(\)]{7,20}\b/gi,
        ],
        replacement: '[REDACTED_PHONE]',
    },
    {
        category: 'physical_addresses',
        name: 'Physical Addresses',
        description: 'Street addresses and postal codes',
        patterns: [
            // Use comprehensive patterns from address-detector module
            ...ADDRESS_PATTERNS,
            ...CITY_PATTERNS,
        ],
        replacement: '[REDACTED_ADDRESS]',
    },
    {
        category: 'ip_addresses',
        name: 'IP Addresses',
        description: 'IPv4 and IPv6 addresses',
        patterns: [
            // IPv4
            /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
            // IPv6 (simplified)
            /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g,
            // IPv6 compressed
            /\b(?:[0-9a-fA-F]{1,4}:){1,7}:\b/g,
            /\b::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}\b/g,
        ],
        replacement: '[REDACTED_IP]',
    },

    // ════════════════════════════════════════════════════════════════════
    // GOVERNMENT IDs
    // ════════════════════════════════════════════════════════════════════
    {
        category: 'government_ids',
        name: 'Government IDs',
        description: 'Passport, driver\'s license, national IDs',
        patterns: [
            // Passport with context
            /\b(?:passport)(?:\s*(?:#|number|no\.?)?:?\s*)[A-Z0-9]{6,12}\b/gi,
            // Driver's license with context
            /\b(?:driver'?s?\s*licen[sc]e|dl|license)(?:\s*(?:#|number|no\.?)?:?\s*)[A-Z0-9\-]{5,20}\b/gi,
            // Generic ID with context
            /\b(?:national\s*id|id\s*card|identity\s*card)(?:\s*(?:#|number|no\.?)?:?\s*)[A-Z0-9\-]{5,20}\b/gi,
            // Medicare (Australia)
            /\b(?:medicare)(?:\s*(?:#|number|no\.?)?:?\s*)[0-9]{10,11}\b/gi,
            // NHS (UK)
            /\b(?:nhs)(?:\s*(?:#|number|no\.?)?:?\s*)[0-9]{3}[\s\-]?[0-9]{3}[\s\-]?[0-9]{4}\b/gi,
        ],
        replacement: '[REDACTED_GOV_ID]',
    },

    // ════════════════════════════════════════════════════════════════════
    // URLs WITH TOKENS
    // ════════════════════════════════════════════════════════════════════
    {
        category: 'token_urls',
        name: 'URLs with Tokens',
        description: 'Reset links, unsubscribe links, tracking URLs',
        patterns: [
            // Password reset URLs
            /https?:\/\/[^\s]*(?:reset|password|recover|forgot)[^\s]*[?&][^\s]*(?:token|key|code|hash|id)=[^\s&"']{10,}[^\s]*/gi,
            // Verification/confirm URLs
            /https?:\/\/[^\s]*(?:verify|confirm|activate|validate)[^\s]*[?&][^\s]*(?:token|key|code|hash|id)=[^\s&"']{10,}[^\s]*/gi,
            // Unsubscribe URLs with tokens
            /https?:\/\/[^\s]*(?:unsubscribe|optout|opt-out|preferences)[^\s]*[?&][^\s]*=[^\s&"']{20,}[^\s]*/gi,
            // Magic link / login URLs
            /https?:\/\/[^\s]*(?:magic|login|signin|auth)[^\s]*[?&][^\s]*(?:token|key|code)=[^\s&"']{10,}[^\s]*/gi,
            // Tracking pixels / URLs with long IDs
            /https?:\/\/[^\s]*[?&](?:track|click|open|view|pixel)[^\s]*=[^\s&"']{20,}[^\s]*/gi,
            // Generic URLs with very long token parameters
            /https?:\/\/[^\s<>"']*[?&][a-z_]*(?:token|key|hash|signature|sig|auth|session)=[A-Za-z0-9_\-\.%]{30,}[^\s<>"']*/gi,
            // URLs with personal/tracking IDs (payeeId, bu, uid, userId, trkId, euid, cnvId, ndid, _ei_, username, etc.)
            /https?:\/\/[^\s<>"']*[?&;](?:payeeId|bu|uid|userId|user_id|trkId|euid|cnvId|mesgId|osub|segname|plmtId|ndid|_ei_|username|pcid)=[A-Za-z0-9_\-\.%]+[^\s<>"']*/gi,
            // URLs with long numeric IDs in path or params
            /https?:\/\/[^\s<>"']*[?&][a-z_]*[iI]d=[0-9]{8,}[^\s<>"']*/gi,
        ],
        replacement: '[REDACTED_URL]',
    },
    {
        category: 'case_numbers',
        name: 'Case/Ticket Numbers',
        description: 'Support cases and tickets',
        patterns: [
            // Case #: 1234567, Case: 1234567
            /\b(?:case|ticket|incident|issue)(?:\s*(?:#|number|no\.?|id)?:?\s*)[0-9]{5,}\b/gi,
            // Support ticket patterns
            /\b(?:support|service|help)(?:\s*(?:ticket|case|request))?(?:\s*(?:#|number|no\.?|id)?:?\s*)[0-9]{5,}\b/gi,
        ],
        replacement: '[REDACTED_CASE]',
    },
    {
        category: 'claim_numbers',
        name: 'Claim Numbers',
        description: 'Insurance and warranty claims',
        patterns: [
            // Claim #1234567, CLAIM# 1234567
            /\b(?:claim)(?:\s*(?:#|number|no\.?|id)?:?\s*)[0-9]{5,}\b/gi,
            // Warranty claim
            /\b(?:warranty|dispute|refund)(?:\s*(?:claim|case|request))?(?:\s*(?:#|number|no\.?|id)?:?\s*)[0-9]{5,}\b/gi,
        ],
        replacement: '[REDACTED_CLAIM]',
    },
    {
        category: 'auth_codes',
        name: 'Authorization Codes',
        description: 'Transaction authorization codes',
        patterns: [
            // Auth. code 12345Z, Authorization #12345
            /\b(?:auth(?:orization)?|approval)(?:\.?\s*(?:code|#|number|no\.?)?:?\s*)[A-Z0-9]{4,}\b/gi,
            // Transaction auth codes
            /\b(?:transaction|trans|txn)(?:\s*(?:auth|code|#|id)?:?\s*)[A-Z0-9]{5,}\b/gi,
        ],
        replacement: '[REDACTED_AUTH]',
    },
    {
        category: 'device_ids',
        name: 'Device IDs',
        description: 'Device and hardware identifiers',
        patterns: [
            // DEVICE-ID: 12345678
            /\b(?:device|hardware|serial|imei|udid|uuid)(?:[\s\-_]*(?:id|number|#)?:?\s*)[A-Z0-9\-]{6,}\b/gi,
            // MAC addresses
            /\b(?:[0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}\b/g,
        ],
        replacement: '[REDACTED_DEVICE]',
    },
    {
        category: 'employee_ids',
        name: 'Employee/Student IDs',
        description: 'Employment and student identifiers',
        patterns: [
            // Employee ID Number is FSA123456
            /\b(?:employee|emp|staff|worker)(?:\s*(?:id|#|number|no\.?)?(?:\s*(?:is|number|:))?\s*)[A-Z0-9]{5,}\b/gi,
            // Student ID
            /\b(?:student)(?:\s*(?:id|#|number|no\.?)?:?\s*)[A-Z0-9]{5,}\b/gi,
            // Badge/ID number
            /\b(?:badge|id)(?:\s*(?:#|number|no\.?)?:?\s*)[A-Z0-9]{5,}\b/gi,
        ],
        replacement: '[REDACTED_EMP_ID]',
    },

    // ════════════════════════════════════════════════════════════════════
    // PII - ON by default
    // ════════════════════════════════════════════════════════════════════
    {
        category: 'email_addresses',
        name: 'Email Addresses',
        description: 'Email addresses in body text',
        patterns: [
            // Standard email pattern
            /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        ],
        replacement: '[REDACTED_EMAIL]',
    },
    {
        category: 'dates_of_birth',
        name: 'Dates of Birth',
        description: 'Birth dates',
        patterns: [
            // DOB with context
            /\b(?:dob|date\s*of\s*birth|birth\s*date|born|birthday)(?:\s*(?:is|was|:)\s*)[0-9]{1,2}[\s\/\-\.][0-9]{1,2}[\s\/\-\.][0-9]{2,4}\b/gi,
            // Born on DATE
            /\b(?:born\s+(?:on\s+)?)[A-Za-z]+\s+[0-9]{1,2},?\s+[0-9]{4}\b/gi,
            // Birthday: MM/DD/YYYY or DD/MM/YYYY
            /\b(?:birthday|dob)(?:\s*:?\s*)[0-9]{1,2}[\s\/\-][0-9]{1,2}[\s\/\-][0-9]{2,4}\b/gi,
        ],
        replacement: '[REDACTED_DOB]',
    },
    {
        category: 'ages',
        name: 'Ages',
        description: 'Specific age mentions',
        patterns: [
            // I am XX years old
            /\b(?:i\s+am|i'm|he\s+is|she\s+is|they\s+are)\s+[0-9]{1,3}\s+(?:years?\s+old|yrs?\s+old|y\.?o\.?)\b/gi,
            // Age: XX or aged XX
            /\b(?:age[d]?|age\s*:)\s*[0-9]{1,3}\b/gi,
            // XX-year-old
            /\b[0-9]{1,3}[\s\-]?year[\s\-]?old\b/gi,
        ],
        replacement: '[REDACTED_AGE]',
    },
    {
        category: 'order_numbers',
        name: 'Order Numbers',
        description: 'Order IDs, confirmation numbers',
        patterns: [
            // Order number with context (handles parentheses)
            /\b(?:order|confirmation|invoice|receipt|transaction|purchase)(?:\s*(?:#|number|no\.?|id)?:?\s*)\(?[A-Z0-9\-]{6,20}\)?\b/gi,
            // Order #XXXXXXX or order (#XXXXXXX)
            /\b(?:order|conf|inv)(?:\s*#?\s*)\(?[A-Z0-9\-]{6,20}\)?\b/gi,
            // Reference number
            /\b(?:reference|ref)(?:\s*(?:#|number|no\.?)?:?\s*)[A-Z0-9\-]{6,20}\b/gi,
        ],
        replacement: '[REDACTED_ORDER]',
    },
    {
        category: 'tracking_numbers',
        name: 'Tracking Numbers',
        description: 'Package tracking numbers',
        patterns: [
            // UPS: 1Z followed by 16 alphanumeric
            /\b1Z[A-Z0-9]{16}\b/gi,
            // FedEx: 12-34 digits
            /\b(?:fedex|fed\s*ex)(?:\s*(?:#|tracking)?:?\s*)[0-9]{12,34}\b/gi,
            // USPS: 20-22 digits or specific formats
            /\b(?:usps|postal)(?:\s*(?:#|tracking)?:?\s*)[0-9]{20,22}\b/gi,
            // Generic tracking with context
            /\b(?:tracking|shipment)(?:\s*(?:#|number|no\.?)?:?\s*)[A-Z0-9]{10,30}\b/gi,
            // DHL
            /\b(?:dhl)(?:\s*(?:#|tracking)?:?\s*)[0-9]{10,11}\b/gi,
        ],
        replacement: '[REDACTED_TRACKING]',
    },
    {
        category: 'booking_references',
        name: 'Booking References',
        description: 'Flight, hotel booking codes',
        patterns: [
            // Airline PNR: 6 alphanumeric
            /\b(?:pnr|booking|confirmation|reservation)(?:\s*(?:#|code|number|ref)?:?\s*)[A-Z0-9]{6}\b/gi,
            // Flight confirmation
            /\b(?:flight|airline)(?:\s*(?:confirmation|booking|ref)?:?\s*)[A-Z0-9]{6}\b/gi,
            // Hotel reservation
            /\b(?:hotel|resort|airbnb)(?:\s*(?:confirmation|booking|reservation)?:?\s*)[A-Z0-9]{6,12}\b/gi,
            // Record locator
            /\b(?:record\s*locator|locator)(?:\s*:?\s*)[A-Z0-9]{6}\b/gi,
        ],
        replacement: '[REDACTED_BOOKING]',
    },
    {
        category: 'member_ids',
        name: 'Member/Loyalty IDs',
        description: 'Membership and loyalty numbers',
        patterns: [
            // Member/membership number
            /\b(?:member|membership)(?:\s*(?:#|number|no\.?|id)?:?\s*)[A-Z0-9\-]{6,20}\b/gi,
            // Loyalty/rewards number
            /\b(?:loyalty|rewards?|points)(?:\s*(?:#|number|no\.?|id)?:?\s*)[A-Z0-9\-]{6,20}\b/gi,
            // Customer ID
            /\b(?:customer|client|user)(?:\s*(?:#|number|no\.?|id)?:?\s*)[A-Z0-9\-]{6,20}\b/gi,
            // Account number (generic)
            /\b(?:account|acct)(?:\s*(?:#|number|no\.?)?:?\s*)[A-Z0-9\-]{6,15}\b/gi,
            // Subscriber ID
            /\b(?:subscriber|subscription)(?:\s*(?:#|number|no\.?|id)?:?\s*)[A-Z0-9\-]{6,20}\b/gi,
            // Airline loyalty programs: RR# 12345678, FF# 12345678, etc.
            /\b(?:RR|FF|MP|SK|AA|UA|DL|WN)(?:\s*#?\s*)[0-9]{8,12}\b/gi,
            // Rapid Rewards, MileagePlus, SkyMiles, AAdvantage with number
            /\b(?:rapid\s*rewards?|mileage\s*plus|sky\s*miles?|aadvantage|frequent\s*flyer)(?:\s*(?:#|number|no\.?|id|account)?:?\s*)[0-9]{8,12}\b/gi,
            // Generic "ID: XXXX" pattern (Loan ID, Item ID, etc.)
            /\b[A-Za-z]+\s*ID:?\s*[A-Z0-9\-]{4,20}\b/gi,
        ],
        replacement: '[REDACTED_MEMBER_ID]',
    },
    {
        category: 'vehicle_ids',
        name: 'Vehicle IDs',
        description: 'License plates, VIN numbers',
        patterns: [
            // VIN: 17 characters
            /\b(?:vin|vehicle\s*identification)(?:\s*(?:#|number|no\.?)?:?\s*)[A-HJ-NPR-Z0-9]{17}\b/gi,
            // Generic VIN pattern (17 alphanumeric, no I, O, Q)
            /\b[A-HJ-NPR-Z0-9]{17}\b/g,
            // License plate with context
            /\b(?:license\s*plate|plate\s*(?:#|number)|registration)(?:\s*:?\s*)[A-Z0-9\-\s]{4,10}\b/gi,
        ],
        replacement: '[REDACTED_VEHICLE]',
    },
    {
        category: 'medical_ids',
        name: 'Medical IDs',
        description: 'Medical record numbers, insurance IDs',
        patterns: [
            // Medical record number
            /\b(?:mrn|medical\s*record|patient\s*id)(?:\s*(?:#|number|no\.?)?:?\s*)[A-Z0-9\-]{6,20}\b/gi,
            // Health insurance ID
            /\b(?:insurance\s*id|policy\s*(?:#|number)|member\s*id)(?:\s*:?\s*)[A-Z0-9\-]{6,20}\b/gi,
            // Prescription number
            /\b(?:prescription|rx)(?:\s*(?:#|number|no\.?)?:?\s*)[A-Z0-9\-]{6,15}\b/gi,
            // Group number
            /\b(?:group)(?:\s*(?:#|number|no\.?)?:?\s*)[A-Z0-9\-]{4,15}\b/gi,
        ],
        replacement: '[REDACTED_MEDICAL]',
    },
    {
        category: 'financial_amounts',
        name: 'Financial Amounts',
        description: 'Dollar amounts and prices',
        patterns: [
            // $1,234.56 or $1234.56
            /\$[0-9,]+\.[0-9]{2}\b/g,
            // $1,234 or $1234 (no cents)
            /\$[0-9,]+\b/g,
            // Spaced amounts: $ 24 . 47 or $ 50 . 00
            /\$\s*[0-9]+\s*\.\s*[0-9]{2}\b/g,
            // Amount: $1234, Balance: $1234, Total: $1234
            /\b(?:amount|balance|total|payment|price|cost|fee|charge)(?:\s*(?:of|is|was|:)?\s*)\$[0-9,]+(?:\.[0-9]{2})?\b/gi,
        ],
        replacement: '[REDACTED_AMOUNT]',
    },
    {
        category: 'regular_urls',
        name: 'All URLs',
        description: 'All URLs including regular ones',
        patterns: [
            // Any URL
            /https?:\/\/[^\s<>"']+/gi,
        ],
        replacement: '[REDACTED_URL]',
    },
];

export interface SanitizeOptions {
    enabled: boolean;
    categories: RedactionCategory[];
}

export const DEFAULT_SANITIZE_OPTIONS: SanitizeOptions = {
    enabled: false,
    categories: DEFAULT_REDACTION_CATEGORIES,
};

export interface SanitizeResult {
    text: string;
    redactionCount: number;
    redactionsByCategory: Record<RedactionCategory, number>;
}

export function sanitizeText(text: string, options: SanitizeOptions): SanitizeResult {
    if (!options.enabled || !text) {
        return {
            text,
            redactionCount: 0,
            redactionsByCategory: {} as Record<RedactionCategory, number>,
        };
    }

    let result = text;
    let totalCount = 0;
    const countsByCategory: Record<RedactionCategory, number> = {} as Record<RedactionCategory, number>;

    // Initialize counts
    for (const cat of ALL_REDACTION_CATEGORIES) {
        countsByCategory[cat] = 0;
    }

    // Apply patterns for enabled categories
    for (const pattern of PATTERNS) {
        if (!options.categories.includes(pattern.category)) {
            continue;
        }

        for (const regex of pattern.patterns) {
            // Reset regex state
            regex.lastIndex = 0;
            
            // Count matches
            const matches = result.match(regex);
            if (matches) {
                countsByCategory[pattern.category] += matches.length;
                totalCount += matches.length;
            }

            // Replace matches
            result = result.replace(regex, pattern.replacement);
        }
    }

    return {
        text: result,
        redactionCount: totalCount,
        redactionsByCategory: countsByCategory,
    };
}

export function getCategoryInfo(category: RedactionCategory): { name: string; description: string; default: boolean } {
    return REDACTION_CATEGORIES[category];
}
