# Kotikirjasto 📚

Omien kirjojen metatiedot — minimaalinen web-sovellus, jolla rakennat
metatietokannan omasta kirjakokoelmastasi. Sovellus käyttää virallista
[@mistralai/mistralai](https://www.npmjs.com/package/@mistralai/mistralai)
TypeScript SDK:ta ja `mistral-small-latest`-mallia.

Ominaisuudet:

- **Keskustelu** — kysy kirjoista, kirjailijoista tai kokoelmasi järjestämisestä.
- **Lisää kirja** — liitä kirjan kuvaus tai takakansi; malli poimii jäsennellyt
  metatiedot (nimi, tekijä, vuosi, genre, ISBN, …) JSON-muodossa ja tallentaa ne.
- **Muokkaa ja poista** — klikkaa kokoelman kirjan nimeä avataksesi
  muokkauslomakkeen, jossa voit täydentää tai korjata mitä tahansa kenttää.
- **Hae verkosta** — täydennää metatiedot automaattisesti Fennicasta
  (Kansalliskirjasto), Open Librariesta ja Google Booksesta. Vain tyhjät
  kentät täytetään — itse kirjoitetut tiedot säilyvät. Kansikuvat haetaan,
  kun ne ovat saatavilla. Google Books -rajapinnan rajoituksia voi nostaa
  lisäämällä valinnaisen `GOOGLE_BOOKS_API_KEY`-avaimen `.env`-tiedostoon.

Mistral-avain säilyy vain palvelimella (`src/server.ts`); selain ei koskaan
näe sitä — selain puhuu vain `/api/chat`- ja `/api/books`-päätepisteille.

## Asennus

```bash
npm install
cp .env.example .env
# lisää sitten .env-tiedostoon avaimesi osoitteesta https://console.mistral.ai
```

## Käynnistys

```bash
npm run dev     # kehityspalvelin uudelleenlatauksella osoitteessa http://localhost:3000
# tai
npm start       # ilman uudelleenlatausta
```

Avaa sitten selaimessa <http://localhost:3000>.

## Rakenne

```
src/server.ts     Express-palvelin: käyttöliittymä, /api/chat, /api/books, /api/lookup
public/           Käyttöliittymä (HTML/CSS/JS)
data/books.json   Kokoelmasi (luodaan ensimmäisen tallennuksen yhteydessä)
```
