// src/address-detector.ts
// Comprehensive address detection for PII sanitization

// US State abbreviations and full names
const US_STATES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
    'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho',
    'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana',
    'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
    'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
    'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
    'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
    'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
    'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
    'West Virginia', 'Wisconsin', 'Wyoming'
];

// Street type suffixes (US)
const STREET_TYPES = [
    'Street', 'St', 'Avenue', 'Ave', 'Road', 'Rd', 'Drive', 'Dr',
    'Lane', 'Ln', 'Way', 'Court', 'Ct', 'Circle', 'Cir', 'Boulevard',
    'Blvd', 'Place', 'Pl', 'Terrace', 'Ter', 'Parkway', 'Pkwy',
    'Highway', 'Hwy', 'Freeway', 'Fwy', 'Expressway', 'Expy',
    'Trail', 'Trl', 'Path', 'Pass', 'Pike', 'Plaza', 'Plz',
    'Alley', 'Aly', 'Center', 'Ctr', 'Commons', 'Crossing', 'Xing',
    'Estate', 'Est', 'Glen', 'Green', 'Grove', 'Heights', 'Hts',
    'Hill', 'Hollow', 'Junction', 'Jct', 'Knoll', 'Lake', 'Landing',
    'Loop', 'Mall', 'Manor', 'Meadow', 'Mill', 'Park', 'Passage',
    'Point', 'Pt', 'Ridge', 'Row', 'Run', 'Square', 'Sq', 'Station',
    'Summit', 'Trace', 'Track', 'Turnpike', 'Tpke', 'Valley', 'View',
    'Village', 'Vista', 'Walk', 'Way'
];

// Spanish/International street types (common in CA, TX, FL, etc.)
const INTERNATIONAL_STREET_TYPES = [
    'Corte', 'Calle', 'Via', 'Camino', 'Avenida', 'Paseo', 'Plaza',
    'Cerrada', 'Circulo', 'Entrada', 'Vereda', 'Sendero', 'Callejon',
    'Rue', 'Strasse', 'Straße', 'Gasse', 'Weg', 'Platz'
];

// Unit/Apartment designators
const UNIT_TYPES = [
    'Apt', 'Apartment', 'Suite', 'Ste', 'Unit', 'Bldg', 'Building',
    'Floor', 'Fl', 'Room', 'Rm', 'Dept', 'Department', 'Lot',
    'Space', 'Spc', 'Slip', 'Pier', 'Hangar', 'Trlr', 'Trailer'
];

// Directional prefixes/suffixes
const DIRECTIONS = [
    'N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW',
    'North', 'South', 'East', 'West',
    'Northeast', 'Northwest', 'Southeast', 'Southwest'
];

// Build regex patterns
function buildStreetTypePattern(): string {
    const allTypes = [...STREET_TYPES, ...INTERNATIONAL_STREET_TYPES];
    return allTypes.map(t => t.replace(/\./g, '\\.')).join('|');
}

function buildUnitTypePattern(): string {
    return UNIT_TYPES.map(t => t.replace(/\./g, '\\.')).join('|');
}

function buildStatePattern(): string {
    // Sort by length descending so longer names match first
    const sorted = [...US_STATES].sort((a, b) => b.length - a.length);
    return sorted.join('|');
}

function buildDirectionPattern(): string {
    return DIRECTIONS.join('|');
}

// Generate all address-related regex patterns
export function getAddressPatterns(): RegExp[] {
    const streetTypes = buildStreetTypePattern();
    const unitTypes = buildUnitTypePattern();
    const states = buildStatePattern();
    const directions = buildDirectionPattern();

    return [
        // Full street address: 123 Main Street or 123 N Main St
        new RegExp(
            `\\b[0-9]{1,6}\\s+(?:(?:${directions})\\.?\\s+)?[A-Za-z0-9\\s]{1,30}(?:${streetTypes})\\.?(?:\\s*[,.]?\\s*(?:${unitTypes})\\.?\\s*#?\\s*[A-Za-z0-9\\-]+)?\\b`,
            'gi'
        ),

        // Street address with number and Spanish/International types
        new RegExp(
            `\\b[0-9]{1,6}\\s+(?:${directions}\\.?\\s+)?[A-Za-z]+(?:\\s+[A-Za-z]+)?\\s+(?:${streetTypes})\\b`,
            'gi'
        ),

        // Standalone unit/apartment: Apt 340, Suite 200, Unit 5A, #123
        new RegExp(
            `\\b(?:${unitTypes})\\.?\\s*#?\\s*[0-9A-Z]{1,6}\\b`,
            'gi'
        ),

        // Just # followed by number (apartment style): #340, # 205
        /\b#\s*[0-9]{1,5}[A-Z]?\b/gi,

        // PO Box variations
        /\b(?:P\.?\s*O\.?\s*Box|Post\s*Office\s*Box|POB)\s*#?\s*[0-9]+\b/gi,

        // City, State ZIP: Los Angeles, CA 90026 or Los Angeles CA 90026-1234
        new RegExp(
            `\\b[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*[,.]?\\s*(?:${states})\\s*[0-9]{5}(?:-[0-9]{4})?\\b`,
            'gi'
        ),

        // State ZIP only: CA 90026
        new RegExp(
            `\\b(?:${states})\\s+[0-9]{5}(?:-[0-9]{4})?\\b`,
            'g'
        ),

        // US ZIP code (5 or 9 digit) - be careful, this is aggressive
        /\b[0-9]{5}(?:-[0-9]{4})?\b/g,

        // UK Postcode: SW1A 1AA, EC1A 1BB, W1A 0AX
        /\b[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}\b/gi,

        // Canada Postal Code: A1A 1A1
        /\b[A-Z][0-9][A-Z]\s*[0-9][A-Z][0-9]\b/gi,

        // Australian Postcode with state: VIC 3000, NSW 2000
        /\b(?:NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\s*[0-9]{4}\b/gi,

        // Address with contextual keywords
        /\b(?:address|ship(?:ping)?|deliver(?:y)?|mail(?:ing)?|located?\s*at|residence|home)\s*(?:to|at|is)?:?\s*[0-9]{1,6}\s+[A-Za-z0-9\s,\.]{10,100}/gi,

        // "at [address]" pattern
        /\bat\s+[0-9]{1,6}\s+[A-Za-z]+(?:\s+[A-Za-z]+){0,3}\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Way|Court|Ct|Boulevard|Blvd)\b/gi,

        // Intersection: Main St & Oak Ave, 5th and Broadway
        /\b[A-Za-z0-9]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr)\s*(?:&|and)\s*[A-Za-z0-9]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr)\b/gi,

        // Floor/Level patterns: Floor 5, Level 3, 5th Floor
        /\b(?:Floor|Level|Fl)\s*#?\s*[0-9]{1,3}\b/gi,
        /\b[0-9]{1,2}(?:st|nd|rd|th)\s+(?:Floor|Level)\b/gi,

        // Building patterns: Building A, Bldg 5
        /\b(?:Building|Bldg)\s*#?\s*[A-Z0-9]{1,5}\b/gi,

        // Common address line 2 patterns
        /\bC\/O\s+[A-Za-z\s]+/gi,  // Care of
        /\bAttn:?\s+[A-Za-z\s]+/gi, // Attention

        // International formats
        // German: Musterstraße 123
        /\b[A-Za-zäöüÄÖÜß]+(?:straße|strasse|gasse|weg|platz|allee)\s*[0-9]+[A-Za-z]?\b/gi,

        // French: 123 Rue de Something
        /\b[0-9]+\s+(?:Rue|Avenue|Boulevard|Place|Chemin|Allée)\s+[A-Za-z\s]+/gi,
    ];
}

// Major US cities (for detection without state)
const MAJOR_CITIES = [
    'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix',
    'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose',
    'Austin', 'Jacksonville', 'Fort Worth', 'Columbus', 'Charlotte',
    'San Francisco', 'Indianapolis', 'Seattle', 'Denver', 'Boston',
    'El Paso', 'Nashville', 'Detroit', 'Portland', 'Memphis',
    'Oklahoma City', 'Las Vegas', 'Louisville', 'Baltimore', 'Milwaukee',
    'Albuquerque', 'Tucson', 'Fresno', 'Sacramento', 'Kansas City',
    'Mesa', 'Atlanta', 'Omaha', 'Colorado Springs', 'Raleigh',
    'Long Beach', 'Virginia Beach', 'Miami', 'Oakland', 'Minneapolis',
    'Tulsa', 'Bakersfield', 'Wichita', 'Arlington', 'Aurora',
    'Tampa', 'New Orleans', 'Cleveland', 'Honolulu', 'Anaheim',
    'Lexington', 'Stockton', 'Corpus Christi', 'Henderson', 'Riverside',
    'Newark', 'Saint Paul', 'Santa Ana', 'Cincinnati', 'Irvine',
    'Orlando', 'Pittsburgh', 'St. Louis', 'Greensboro', 'Jersey City',
    'Anchorage', 'Lincoln', 'Plano', 'Durham', 'Buffalo',
    'Chandler', 'Chula Vista', 'Toledo', 'Madison', 'Gilbert',
    'Reno', 'Fort Wayne', 'North Las Vegas', 'St. Petersburg', 'Lubbock',
    'Irving', 'Laredo', 'Winston-Salem', 'Chesapeake', 'Glendale',
    'Garland', 'Scottsdale', 'Norfolk', 'Boise', 'Fremont',
    'Spokane', 'Santa Clarita', 'Baton Rouge', 'Richmond', 'Hialeah',
    // California cities (since user is in CA)
    'Carlsbad', 'Oceanside', 'Escondido', 'Vista', 'Encinitas',
    'San Marcos', 'Poway', 'La Jolla', 'Del Mar', 'Solana Beach',
    'Rancho Santa Fe', 'Coronado', 'Chula Vista', 'National City',
    'Imperial Beach', 'La Mesa', 'El Cajon', 'Santee', 'Lakeside'
];

// Get city patterns
export function getCityPatterns(): RegExp[] {
    // Sort by length descending
    const sortedCities = [...MAJOR_CITIES].sort((a, b) => b.length - a.length);
    
    return sortedCities.map(city => {
        const escaped = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // City followed by comma and state or ZIP
        return new RegExp(`\\b${escaped}\\s*[,.]?\\s*(?:[A-Z]{2}\\s*)?[0-9]{5}(?:-[0-9]{4})?\\b`, 'gi');
    });
}

// Redact addresses from text
export function redactAddresses(text: string): { text: string; count: number } {
    let result = text;
    let totalCount = 0;

    // Apply all address patterns
    const patterns = getAddressPatterns();
    for (const pattern of patterns) {
        pattern.lastIndex = 0;
        const matches = result.match(pattern);
        if (matches) {
            totalCount += matches.length;
        }
        result = result.replace(pattern, '[REDACTED_ADDRESS]');
    }

    // Apply city patterns (more targeted)
    const cityPatterns = getCityPatterns();
    for (const pattern of cityPatterns) {
        pattern.lastIndex = 0;
        const matches = result.match(pattern);
        if (matches) {
            totalCount += matches.length;
        }
        result = result.replace(pattern, '[REDACTED_ADDRESS]');
    }

    // Clean up multiple consecutive redactions
    result = result.replace(/(\[REDACTED_ADDRESS\]\s*)+/g, '[REDACTED_ADDRESS] ');

    return { text: result, count: totalCount };
}

// Export for use in sanitizer
export const ADDRESS_PATTERNS = getAddressPatterns();
export const CITY_PATTERNS = getCityPatterns();
