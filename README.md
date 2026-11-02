# Atelier des rues de Tours

Outil interactif (une seule page HTML) pour redessiner le réseau de transport de Tours Métropole : usage des rues, lignes de tram et de bus, coupes de rue à largeur fixe, voies partagées tram/voiture, chiffres d'impact.

Ouvrir `index.html` dans un navigateur, sans serveur ni installation.

## Contenu
- Tram A existant, ligne 2 de tram en construction et BHNS (ex-ligne de bus 2), tracés relevés à la main sur les cartes officielles (`docs/`), précision de quelques dizaines de mètres.
- Réseau Fil Bleu existant (41 lignes), modifiable.
- Largeurs de rues estimées par type de voie, ajustables.
- Impact : habitants desservis (estimés d'après l'emprise du bâti), km de réseau.
- Les modifications sont stockées dans le navigateur (localStorage).

## Reconstruire
`make` assemble `src/` et `data/metro.json` en `index.html` (Python 3 et Node requis).
`scripts/fetch_osm.py <sortie.json>` retélécharge les données OpenStreetMap (API `map`, lente).

Données © contributeurs OpenStreetMap (ODbL). Cartes de la ligne 2 : lignes2tram.fr.
