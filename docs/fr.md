# Gecko in.touch2

Pilotez depuis Gladys un spa équipé d'un contrôleur Gecko et de son module
Wi-Fi **in.touch2** : température de l'eau, consigne, pompes, souffleur,
cascade, éclairage et mode de traitement de l'eau.

L'intégration dialogue **directement avec le module in.touch2 sur votre réseau
local** (port UDP 10022), comme le fait l'application officielle in.touch2 à
la maison. Pas de compte cloud, pas de mot de passe : le spa reste pilotable
depuis Gladys même sans internet.

## Prérequis

- Un spa avec un contrôleur Gecko (in.YT, in.XE, in.YJ, in.XM, in.YE…) et son
  module in.touch2, déjà appairé et fonctionnel avec l'application in.touch2.
- Le module in.touch2 (le boîtier branché près de votre box) sur le même
  réseau local que Gladys.
- Gladys 5.1 ou plus récent.

## Mise en route

1. Installez l'intégration, puis ouvrez son onglet **Découverte** : les modules
   in.touch2 du réseau répondent en quelques secondes. Ajoutez votre spa.
2. Pas trouvé ? Attribuez une adresse fixe au module in.touch2 dans votre box
   (réservation DHCP), saisissez-la dans **Adresse du module in.touch2** de
   l'onglet **Configuration**, enregistrez, puis rouvrez l'onglet Découverte.
3. **Rechercher les spas** (onglet Configuration) lance la même recherche et
   indique ce qui a répondu ; **Tester la connexion** vérifie chaque spa connu
   et affiche le signal radio entre le module et le spa.

## Ce que vous obtenez

Un appareil par spa, dont les fonctionnalités dépendent de ce qui est câblé
sur votre contrôleur :

| Fonctionnalité          | Description                                                           |
| ----------------------- | --------------------------------------------------------------------- |
| Température de l'eau    | Mesurée par le spa (°C, convertie par Gladys si vous utilisez les °F) |
| Température de consigne | Réglable dans la plage de votre spa (15–40 °C)                        |
| Chauffe                 | Le réchauffeur fonctionne-t-il                                        |
| Pompe 1…5               | Marche/arrêt (marche = vitesse rapide)                                |
| Souffleur, cascade      | Marche/arrêt                                                          |
| Éclairage, éclairage 2  | Marche/arrêt                                                          |
| Pompe de circulation    | Lecture seule                                                         |
| Ozone                   | Lecture seule                                                         |
| Mode de traitement      | Absent, Standard, Économie d'énergie, Super économie, Week-end        |
| Signal radio            | Qualité de la liaison radio entre le module in.touch2 et le spa       |

Les valeurs sont envoyées par le spa dès qu'elles changent : aucune
interrogation périodique.

## Scènes

Déclencheurs :

- **Eau du spa à température** — l'eau a atteint la consigne. Les actions
  suivantes peuvent lire `{{triggerEvent.data.temperature}}`.
- **Chauffe du spa démarrée ou arrêtée** — filtrez sur démarrée et/ou arrêtée.
- **Connexion au spa perdue ou rétablie** — le module in.touch2 ne répond
  plus, ou répond de nouveau.

Actions :

- **Régler la température du spa** — renvoie la température réellement
  appliquée.
- **Régler le mode de traitement**.
- **Piloter une pompe ou un éclairage** — arrêt, vitesse lente ou rapide.
  Indique si le spa possède cet équipement.
- **Arrêter les jets et l'éclairage du spa** — renvoie le nombre
  d'équipements qui étaient en marche.

## Tableau de bord

Le widget **Aperçu du spa** affiche la température de l'eau et la consigne
(en direct), la chauffe, le mode de traitement et la connexion, avec des
boutons pour allumer/éteindre l'éclairage, changer la température et tout
arrêter. Avec plusieurs spas, choisissez-en un dans les réglages du widget.

## Dépannage

- **Rien n'est trouvé** — le module répond aux diffusions sur le port UDP 10022. Certaines box ou systèmes mesh les filtrent : saisissez l'adresse du
  module dans la configuration. Vérifiez que l'application officielle
  fonctionne sur le même Wi-Fi.
- **Injoignable** — le module ne répond plus (alimentation, Wi-Fi).
  L'intégration réessaie toutes les minutes.
- **Point orange sur le badge** — le module répond mais sa liaison radio avec
  le spa est instable : rapprochez le module du spa.
- **Contrôleur non pris en charge** — les logs indiquent la plateforme et les
  versions de carte mémoire : ouvrez un ticket sur la page du projet avec ces
  informations.

Sur certains firmwares, une seule application peut piloter le spa à la fois :
si l'application officielle perd sa connexion pendant que Gladys est
connecté, c'est normal.
