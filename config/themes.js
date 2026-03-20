// Static theme definitions — single source of truth
const THEMES = [
  { slug: 'handwerk', name: 'Handwerk', icon: 'i-handwerk' },
  { slug: 'selbstaendigkeit', name: 'Selbständigkeit', icon: 'i-selbst' },
  { slug: 'fuehrungskompetenzen', name: 'Führungskompetenzen', icon: 'i-fuehrung' },
  { slug: 'abrechnung-operativ', name: 'Abrechnung & Operativ', icon: 'i-abrechnung' },
  { slug: 'aktien-maerkte', name: 'Aktien & Märkte', icon: 'i-aktien' },
  { slug: 'krypto', name: 'Krypto', icon: 'i-krypto' },
  { slug: 'makrooekonomie', name: 'Makroökonomie', icon: 'i-makro' },
  { slug: 'schweizer-politik', name: 'Schweizer Politik', icon: 'i-lokal' },
  { slug: 'europaeische-politik', name: 'Europäische Politik', icon: 'i-europa' },
  { slug: 'weltpolitik', name: 'Weltpolitik', icon: 'i-politik' },
  { slug: 'ki', name: 'KI', icon: 'i-ki' },
  { slug: 'ki-automatisierung', name: 'KI-Automatisierung', icon: 'i-kiauto' },
  { slug: 'robotik', name: 'Robotik', icon: 'i-robotik' },
  { slug: 'technik', name: 'Technik', icon: 'i-technik' },
  { slug: 'sport', name: 'Sport', icon: 'i-sport' },
  { slug: 'enthuellung', name: 'Enthüllungen', icon: 'i-enthuellung' }
];

function getThemeBySlug(slug) {
  return THEMES.find(t => t.slug === slug) || null;
}

module.exports = { THEMES, getThemeBySlug };
