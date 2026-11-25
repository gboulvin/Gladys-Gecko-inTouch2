// -----------------------------------------------------------------------------
// User-facing texts, in the four languages of the integration: English (the
// mandatory fallback), French, German and Spanish. Gladys picks the user's
// language from these multi-language objects.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // Connection status / errors
  noSpa: {
    en: 'No spa found yet: open the Discovery tab, or type the address of the in.touch2 module.',
    fr: "Aucun spa trouvé pour l'instant : ouvrez l'onglet Découverte, ou saisissez l'adresse du module in.touch2.",
    de: 'Noch kein Spa gefunden: Öffnen Sie den Tab „Erkennung“ oder geben Sie die Adresse des in.touch2-Moduls ein.',
    es: 'Aún no se ha encontrado ningún spa: abra la pestaña Descubrimiento o escriba la dirección del módulo in.touch2.',
  },
  someUnreachable: {
    en: 'At least one spa does not answer: check that the in.touch2 module is powered and on the network.',
    fr: 'Au moins un spa ne répond pas : vérifiez que le module in.touch2 est alimenté et sur le réseau.',
    de: 'Mindestens ein Spa antwortet nicht: Prüfen Sie, ob das in.touch2-Modul eingeschaltet und im Netzwerk ist.',
    es: 'Al menos un spa no responde: compruebe que el módulo in.touch2 esté encendido y conectado a la red.',
  },
  initFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
    de: 'Die Initialisierung ist fehlgeschlagen, prüfen Sie die Protokolle der Integration.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },
  rfDegraded: {
    en: 'The in.touch2 module answers, but its radio link with the spa is unstable.',
    fr: 'Le module in.touch2 répond, mais sa liaison radio avec le spa est instable.',
    de: 'Das in.touch2-Modul antwortet, aber seine Funkverbindung zum Spa ist instabil.',
    es: 'El módulo in.touch2 responde, pero su enlace de radio con el spa es inestable.',
  },
  // Manifest action results
  scanNone: {
    en: 'No in.touch2 module answered. Check that it is on the same network as Gladys, or type its address.',
    fr: "Aucun module in.touch2 n'a répondu. Vérifiez qu'il est sur le même réseau que Gladys, ou saisissez son adresse.",
    de: 'Kein in.touch2-Modul hat geantwortet. Prüfen Sie, ob es im selben Netzwerk wie Gladys ist, oder geben Sie seine Adresse ein.',
    es: 'Ningún módulo in.touch2 ha respondido. Compruebe que esté en la misma red que Gladys o escriba su dirección.',
  },
  testNoSpa: {
    en: 'No spa to test yet: run a search first.',
    fr: "Aucun spa à tester pour l'instant : lancez d'abord une recherche.",
    de: 'Noch kein Spa zum Testen: Starten Sie zuerst eine Suche.',
    es: 'Aún no hay ningún spa que probar: inicie primero una búsqueda.',
  },
  identifyUnsupported: {
    en: 'This spa has no light to blink.',
    fr: "Ce spa n'a pas d'éclairage à faire clignoter.",
    de: 'Dieser Spa hat kein Licht zum Blinken.',
    es: 'Este spa no tiene ninguna luz que hacer parpadear.',
  },
  identifyDone: {
    en: 'Look at the spa: its light is blinking.',
    fr: 'Regardez le spa : son éclairage clignote.',
    de: 'Sehen Sie zum Spa: sein Licht blinkt.',
    es: 'Mire el spa: su luz está parpadeando.',
  },
  // Widget
  water: { en: 'Water', fr: 'Eau', de: 'Wasser', es: 'Agua' },
  target: { en: 'Target', fr: 'Consigne', de: 'Sollwert', es: 'Consigna' },
  heating: { en: 'Heating', fr: 'Chauffe', de: 'Heizung', es: 'Calefacción' },
  heatingOn: { en: 'Heating', fr: 'En chauffe', de: 'Heizt', es: 'Calentando' },
  heatingOff: { en: 'Idle', fr: 'Au repos', de: 'Inaktiv', es: 'En reposo' },
  watercare: {
    en: 'Water care',
    fr: "Traitement de l'eau",
    de: 'Wasserpflege',
    es: 'Cuidado del agua',
  },
  connection: { en: 'Connection', fr: 'Connexion', de: 'Verbindung', es: 'Conexión' },
  connected: { en: 'Connected', fr: 'Connecté', de: 'Verbunden', es: 'Conectado' },
  unreachable: { en: 'Unreachable', fr: 'Injoignable', de: 'Nicht erreichbar', es: 'Inaccesible' },
  running: { en: 'Running', fr: 'En marche', de: 'Läuft', es: 'Encendido' },
  unknown: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
  toggleLight: { en: 'Light', fr: 'Éclairage', de: 'Licht', es: 'Luz' },
  stopAll: { en: 'Stop all', fr: 'Tout arrêter', de: 'Alles stoppen', es: 'Detener todo' },
  setTemperature: { en: 'Temperature', fr: 'Température', de: 'Temperatur', es: 'Temperatura' },
  temperatureField: {
    en: 'Target temperature (°C)',
    fr: 'Température de consigne (°C)',
    de: 'Solltemperatur (°C)',
    es: 'Temperatura de consigna (°C)',
  },
  noSpaWidget: {
    en: 'No spa connected yet.',
    fr: 'Aucun spa connecté pour le moment.',
    de: 'Noch kein Spa verbunden.',
    es: 'Aún no hay ningún spa conectado.',
  },
  stopped: {
    en: 'Jets, blower and lights stopped.',
    fr: 'Jets, souffleur et éclairage arrêtés.',
    de: 'Düsen, Gebläse und Licht gestoppt.',
    es: 'Chorros, soplador y luces detenidos.',
  },
  lightOn: { en: 'Light on.', fr: 'Éclairage allumé.', de: 'Licht an.', es: 'Luz encendida.' },
  lightOff: { en: 'Light off.', fr: 'Éclairage éteint.', de: 'Licht aus.', es: 'Luz apagada.' },
};

/** A multi-language text by key. */
export function t(key) {
  const text = TEXTS[key];
  if (!text) {
    throw new Error(`Missing text "${key}"`);
  }
  return text;
}

/** Fill `{name}` placeholders in every language of a text. */
export function format(text, values) {
  return Object.fromEntries(
    Object.entries(text).map(([language, value]) => [
      language,
      value.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? '')),
    ]),
  );
}

/** Same message in every language, built per language. */
export function perLanguage(build) {
  return Object.fromEntries(LANGUAGES.map((language) => [language, build(language)]));
}

export const WATERCARE_LABELS = {
  away: { en: 'Away from home', fr: 'Absent', de: 'Abwesend', es: 'Fuera de casa' },
  standard: { en: 'Standard', fr: 'Standard', de: 'Standard', es: 'Estándar' },
  energy_saving: {
    en: 'Energy saving',
    fr: "Économie d'énergie",
    de: 'Energiesparen',
    es: 'Ahorro de energía',
  },
  super_energy_saving: {
    en: 'Super energy saving',
    fr: "Super économie d'énergie",
    de: 'Super-Energiesparen',
    es: 'Súper ahorro de energía',
  },
  weekender: { en: 'Weekender', fr: 'Week-end', de: 'Wochenende', es: 'Fin de semana' },
};

export const TEXTS_FOR_TESTS = TEXTS;
