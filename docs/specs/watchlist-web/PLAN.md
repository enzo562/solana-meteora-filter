# Plan — Gestion web de la watchlist des alertes de sortie

> Une page **`/watchlist`** dans la SPA pour **ajouter, retirer et renommer** les tokens surveillés
> par `indicator-alerter`, et voir l'**état de surveillance** de chacun. La page s'appuie sur un
> petit service local **Java 25 / Spring Boot 4.1** (`watchlist-api/`), qui édite
> `indicator-alerter/watchlist.json` à la place de l'édition manuelle.
>
> Statut : **spécifié, non implémenté**. Version 2.1 — 2026-10-04 (cf. Historique).
> Cibles : `watchlist-api/`, `src/pages/WatchlistPage.tsx`, `vite.config.ts`, `src/App.tsx`,
> `indicator-alerter/index.ts` (purge de l'état, §7).

## Historique

| Version | Date | Changement | Pourquoi |
|---|---|---|---|
| v1 | 2026-10-03 | Spec initiale en trois documents (fonctionnelle, technique, plan de mise en œuvre) | Format des specs précédentes du projet |
| v2 | 2026-10-04 | Fusion en ce seul `PLAN.md` ; JDK 25 noté comme installé et configuré | Trois documents jugés trop lourds pour une fonctionnalité de cette taille (décision d'Enzo) ; le passage à Java 25 a été fait le 2026-10-03 |
| v2.1 | 2026-10-04 | Corrections de relecture : `NO_POOL` ne couvre pas les erreurs d'API de résolution (§4), limites de l'indicateur d'activité (§4), chemins Windows dans `.env` (§5.2), cas limites de la purge (§7) | Affirmations du plan confrontées au code réel de `indicator-alerter` |

---

## 1. Contexte & décisions

**Problème.** La watchlist est un fichier JSON édité à la main. Une virgule en trop fait sauter
les cycles de l'alerteur (`indicator-alerter.cycle.unexpected_error`), et rien n'indique si un
token ajouté est vraiment surveillé (pool trouvé, assez de bougies, amorçage fait) ni si l'alerteur
tourne.

**Pourquoi un service local.** La SPA tourne à 100 % dans le navigateur et ne peut pas écrire sur
le disque. Il faut un processus local entre la page et `watchlist.json`.

**Décisions d'Enzo :**
- interface **web** (2026-10-03) — les commandes Telegram `/add` `/remove` ont été écartées ;
- service en **Java / Spring Boot** (2026-10-03) — un serveur `node:http` intégré à l'alerteur,
  plus léger, a été écarté ;
- **un seul document** (2026-10-04) : d'abord pour cette spec, puis érigé en règle du projet
  (`CLAUDE.md`, section « Specs and research »).

**Inclus :** service `watchlist-api` ; page `/watchlist` (lister, ajouter, renommer, retirer, voir
les statuts) ; purge de l'état des tokens retirés dans l'alerteur ; scripts npm de lancement.

**Exclu :** accès à distance ou depuis le téléphone (écoute sur `127.0.0.1` seulement) ;
authentification ; réglage des signaux depuis la page ; historique des alertes envoyées (non
enregistré aujourd'hui) ; vérification du CA auprès d'une API externe à l'ajout ; démarrer ou
arrêter l'alerteur depuis la page.

---

## 2. Règles à ne pas casser

| # | Règle |
|---|---|
| RG-01 | **`watchlist.json` reste la source de vérité.** L'alerteur le relit à chaque cycle, comme aujourd'hui, et fonctionne avec ou sans le service. L'édition manuelle reste possible. |
| RG-02 | Un CA est valide s'il est en base58 (32 à 44 caractères) **et** se décode en exactement 32 octets : même règle que `isValidSolanaAddress` dans `TokenScannerPage.tsx`. Espaces en début et fin ignorés. |
| RG-03 | Un CA n'apparaît qu'**une fois**. |
| RG-04 | Label optionnel, espaces en début et fin retirés, **40 caractères maximum** ; un label vide équivaut à aucun label. |
| RG-05 | **Retirer un token oublie son état** : l'alerteur purge de `state.json` les tokens absents de la watchlist (§7). Sans ça, un token rajouté des jours plus tard déclencherait le rattrapage de `processEntry`, avec une alerte sur une vieille bougie. |
| RG-06 | Un ajout **n'alerte jamais immédiatement** : c'est l'amorçage silencieux existant. |
| RG-07 | **Seul l'alerteur écrit `state.json`.** Le service le lit seulement. |
| RG-08 | Le service n'écoute que sur **`127.0.0.1`**, sans authentification. |
| RG-09 | Si `watchlist.json` est un JSON invalide, le service **refuse toute écriture** et le signale : il n'écrase jamais un fichier qu'il n'a pas compris. |
| RG-10 | Une modification prend effet **au prochain cycle de l'alerteur** (2 min au plus par défaut) ; la page l'indique sous le formulaire. |
| RG-11 | Le service écrit toujours un **tableau d'objets** `{ "mint", "label"? }`. Une chaîne nue écrite à la main est convertie en objet à la première écriture ; l'alerteur accepte les deux formes. |
| RG-12 | Le service **relit le fichier avant chaque écriture**, pour ne pas perdre une édition manuelle récente. En cas d'édition simultanée, la dernière écriture l'emporte. Fichier absent = watchlist vide, créé au premier ajout. |

---

## 3. Architecture

```
┌──────────────── Navigateur ────────────────┐
│ SPA React (Vite, :5173)                    │
│   /watchlist → WatchlistPage.tsx           │
│        fetch("/api/watchlist…")            │
└───────────────┬────────────────────────────┘
                │ proxy Vite  /api → http://127.0.0.1:8080
                ▼
┌──────── watchlist-api (Spring Boot, Java 25, 127.0.0.1:8080) ────────┐
│ WatchlistController ─▶ WatchlistService ─┬▶ WatchlistRepository       │
│                                          │    lit + ÉCRIT (atomique)  │
│                                          │    indicator-alerter/watchlist.json
│                                          └▶ AlerterStateReader        │
│                                               LIT SEULEMENT           │
│                                               indicator-alerter/.state/state.json
└───────────────────────────────────────────────────────────────────────┘
                ▲ relit watchlist.json à chaque cycle, écrit state.json
┌──────── indicator-alerter (Node, inchangé sauf purge §7) ────────┐
└──────────────────────────────────────────────────────────────────┘
```

| Fichier | Écrit par | Lu par |
|---|---|---|
| `indicator-alerter/watchlist.json` | `watchlist-api`, Enzo (à la main) | alerteur, `watchlist-api` |
| `indicator-alerter/.state/state.json` | **alerteur uniquement** | alerteur, `watchlist-api` |

**Ce qu'on réutilise de l'existant :**
- `indicator-alerter/watchlist.ts` (`readWatchlist`) : règles de lecture à reproduire en Java.
  Tableau JSON ; entrée = chaîne nue **ou** `{ mint, label? }` ; `trim` ; entrées invalides et
  doublons ignorés ; fichier absent ou vide = liste vide.
- `state.json` (`TokenState` dans `types.ts`) : `{ [mint]: { mint, pool, lastProcessedCandleTs,
  updatedAt } }`. `pool` vaut une adresse ou `null`. `lastProcessedCandleTs` est en secondes Unix
  (heure d'**ouverture** de la bougie) ou `null`. `updatedAt` est en millisecondes. Le fichier est
  réécrit en entier à chaque cycle par `fs.writeFile`, de façon **non atomique**.
- Chemins par défaut et variables `INDICATOR_WATCHLIST_PATH` / `INDICATOR_STATE_FILE_PATH`
  (`indicator-alerter/config.ts`) ; elles ne sont pas définies dans le `.env` actuel.

Le **proxy Vite** évite toute configuration CORS : la page appelle `/api/...` sur sa propre
origine.

---

## 4. Statuts de surveillance

Ils se déduisent de l'entrée de `state.json` du token :

| État dans `state.json` | `WatchStatus` | Affichage | Signification |
|---|---|---|---|
| Aucune entrée | `PENDING_FIRST_CYCLE` | ⏳ En attente du premier cycle | Ajouté depuis le dernier cycle, ou alerteur arrêté |
| `pool` null, aucune bougie évaluée | `NO_POOL` | ⚠️ Pool introuvable | GeckoTerminal ne renvoie aucun pool (CA erroné, pas de liquidité), ou l'appel aux bougies a échoué avant le premier amorçage ; nouvel essai à chaque cycle |
| `pool` connu, aucune bougie évaluée | `WARMING_UP` | 🕒 Token trop récent | Moins de 40 bougies 15 min (10 h d'historique) |
| `pool` null, bougie déjà évaluée | `RETRYING` | 🔁 Erreur de récupération | Le dernier appel aux bougies a échoué ; pool recherché à nouveau au prochain cycle |
| `pool` connu, bougie évaluée | `WATCHING` | ✅ Surveillé — dernière bougie HH:MM UTC | Amorçage fait ; chaque bougie clôturée est évaluée |

**Activité de l'alerteur** = `max(updatedAt)` sur toutes les entrées. L'alerteur est considéré
comme inactif au-delà de `3 × INDICATOR_SCAN_INTERVAL_MS`, soit 6 min par défaut. Si l'état est
vide, l'activité est « inconnue ».

**Limites, dues au code actuel de l'alerteur** (`processEntry` dans `index.ts`) :
- si `resolveMostLiquidPool` **lève une erreur** (GeckoTerminal en panne, limite de requêtes),
  l'exception n'est pas rattrapée dans `processEntry`. Le cycle journalise
  `indicator-alerter.cycle.token_failed` et **n'écrit aucune entrée** pour ce token. Un token tout
  juste ajouté reste alors « ⏳ En attente du premier cycle » tant que l'erreur dure : ce n'est pas
  `NO_POOL` ;
- pour la même raison, si **tous** les tokens échouent à chaque cycle, `updatedAt` ne bouge plus et
  l'alerteur apparaît « inactif » alors qu'il tourne. Le bandeau dit donc « inactif **ou en
  erreur** depuis X min — voir ses logs ».

---

## 5. Service `watchlist-api`

### 5.1 Environnement et génération
- **JDK 25** : `C:\Program Files\Eclipse Adoptium\jdk-25.0.4.7-hotspot`. `JAVA_HOME` et `Path`
  pointent dessus depuis le 2026-10-03 (vérifié : `java -version` et `mvn -v` donnent 25.0.4).
  Le JDK 8 reste installé.
- **Spring Boot 4.1.x** (dernière stable au 2026-10-03, vérifié sur Maven Central). Elle embarque
  **Jackson 3** (paquets `tools.jackson.*`). Le starter web s'appelle `spring-boot-starter-webmvc` ;
  `spring-boot-starter-web` est déprécié.
- Génération via https://start.spring.io ou l'assistant Spring Boot d'IntelliJ : Maven, Java 25,
  Boot 4.1.x, Group `dev.enzo`, Artifact `watchlist-api`, package `dev.enzo.watchlistapi`,
  Jar, dépendance **Spring Web** uniquement. Dézipper dans **`watchlist-api/`** à la racine du repo,
  avec `mvnw`, `mvnw.cmd` et `.mvn/`. Pas de base de données, pas d'Actuator, pas de Lombok.

```
watchlist-api/src/main/java/dev/enzo/watchlistapi/
├── WatchlistApiApplication.java   (généré)
├── SolanaAddress.java             RG-02
├── WatchlistEntry.java            record { mint, label }
├── WatchlistRepository.java       lecture tolérante, écriture atomique
├── AlerterState.java              record miroir de TokenState
├── AlerterStateReader.java        lecture seule de state.json
├── WatchlistService.java          règles + statuts
├── WatchlistController.java       endpoints REST
└── ApiExceptionHandler.java       erreurs → { error, message }
```

### 5.2 `application.properties`

```properties
# Réutilise le .env du repo (format KEY=VALUE) : une seule source de config.
spring.config.import=optional:file:../.env[.properties]

# RG-08 : jamais exposé au réseau.
server.address=127.0.0.1
server.port=${WATCHLIST_API_PORT:8080}

# Chemins relatifs au dossier de lancement (watchlist-api/, cf. §9).
watchlist.file=${INDICATOR_WATCHLIST_PATH:../indicator-alerter/watchlist.json}
watchlist.state-file=${INDICATOR_STATE_FILE_PATH:../indicator-alerter/.state/state.json}
watchlist.alerter-scan-interval-ms=${INDICATOR_SCAN_INTERVAL_MS:120000}
```

L'import du `.env` charge aussi les secrets Discord et Telegram dans l'environnement Spring.
Aucun endpoint ne les expose. Si on préfère éviter ce chargement, retirer la ligne : le
comportement par défaut reste identique tant que le `.env` ne surcharge pas ces chemins.

**Attention aux chemins Windows.** Spring lit le `.env` comme un fichier `.properties`, où `\` est
un caractère d'échappement. Si `INDICATOR_WATCHLIST_PATH` ou `INDICATOR_STATE_FILE_PATH` sont un
jour définis dans `.env`, il faut les écrire avec des `/` (`C:/Users/...`), sinon Spring et
l'alerteur ne liraient pas le même fichier. Node accepte les deux séparateurs, donc le chemin reste
valable pour l'alerteur.

### 5.3 Code de référence

> Les exemples visent **Jackson 3** : `ObjectMapper`, `JsonMapper` et `TypeReference` sont dans
> `tools.jackson.*`, leurs exceptions sont non vérifiées (`JacksonException`), et les annotations
> restent dans `com.fasterxml.jackson.annotation`. Laisser l'IDE corriger un import si une classe a
> bougé.

**`SolanaAddress.java`** (RG-02) :

```java
package dev.enzo.watchlistapi;

import java.math.BigInteger;
import java.util.regex.Pattern;

public final class SolanaAddress {
    private static final Pattern FORMAT = Pattern.compile("^[1-9A-HJ-NP-Za-km-z]{32,44}$");
    private static final String ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    private static final BigInteger BASE = BigInteger.valueOf(58);

    private SolanaAddress() {}

    // Le gabarit seul ne garantit pas 32 octets décodés : on décode réellement le base58.
    public static boolean isValid(String address) {
        if (address == null || !FORMAT.matcher(address).matches()) return false;
        BigInteger value = BigInteger.ZERO;
        for (char c : address.toCharArray()) {
            value = value.multiply(BASE).add(BigInteger.valueOf(ALPHABET.indexOf(c)));
        }
        int leadingZeroBytes = 0;
        while (leadingZeroBytes < address.length() && address.charAt(leadingZeroBytes) == '1') leadingZeroBytes++;
        int bodyBytes = value.signum() == 0 ? 0 : (value.bitLength() + 7) / 8;
        return leadingZeroBytes + bodyBytes == 32;
    }
}
```

**`WatchlistEntry.java`** :

```java
package dev.enzo.watchlistapi;

import com.fasterxml.jackson.annotation.JsonInclude;

// label absent du JSON quand il est null : même forme que les entrées écrites à la main.
@JsonInclude(JsonInclude.Include.NON_NULL)
public record WatchlistEntry(String mint, String label) {}
```

**`WatchlistRepository.java`** (lecture identique à `watchlist.ts`, RG-09, écriture atomique) :

```java
package dev.enzo.watchlistapi;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

@Repository
public class WatchlistRepository {
    private final Path file;
    private final JsonMapper mapper;

    public WatchlistRepository(@Value("${watchlist.file}") String file, JsonMapper mapper) {
        this.file = Path.of(file).toAbsolutePath().normalize();
        this.mapper = mapper;
    }

    // Fichier absent ou vide = watchlist vide. JSON invalide = exception (RG-09).
    public List<WatchlistEntry> read() throws IOException {
        if (!Files.exists(file)) return new ArrayList<>();
        String raw = Files.readString(file, StandardCharsets.UTF_8);
        if (raw.isBlank()) return new ArrayList<>();

        List<?> parsed;
        try {
            parsed = mapper.readValue(raw, List.class);
        } catch (JacksonException e) {
            throw new InvalidWatchlistFileException(file, e);
        }

        Set<String> seen = new HashSet<>();
        List<WatchlistEntry> entries = new ArrayList<>();
        for (Object item : parsed) {
            WatchlistEntry entry = normalize(item);
            if (entry != null && seen.add(entry.mint())) entries.add(entry);
        }
        return entries;
    }

    private static WatchlistEntry normalize(Object item) {
        if (item instanceof String s) {
            return s.isBlank() ? null : new WatchlistEntry(s.trim(), null);
        }
        if (item instanceof Map<?, ?> m && m.get("mint") instanceof String mint && !mint.isBlank()) {
            String label = m.get("label") instanceof String l && !l.isBlank() ? l.trim() : null;
            return new WatchlistEntry(mint.trim(), label);
        }
        return null;
    }

    // Écrit dans un fichier temporaire puis le renomme : l'alerteur ne lit jamais un fichier à moitié
    // écrit. Sous Windows, le renommage peut échouer si l'alerteur lit le fichier au même instant :
    // on réessaie brièvement.
    public void write(List<WatchlistEntry> entries) throws IOException {
        Files.createDirectories(file.getParent());
        Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
        Files.writeString(tmp, mapper.writerWithDefaultPrettyPrinter().writeValueAsString(entries) + "\n",
                StandardCharsets.UTF_8);
        for (int attempt = 1; ; attempt++) {
            try {
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
                return;
            } catch (AccessDeniedException e) {
                if (attempt == 5) throw e;
                try {
                    Thread.sleep(50L * attempt);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw e;
                }
            }
        }
    }
}
```

`InvalidWatchlistFileException` est une `RuntimeException` qui porte le chemin. Elle devient un
HTTP 409 (§6).

**`AlerterState` et `AlerterStateReader`**. Lecture seule, avec réessais parce que Node écrit le
fichier de façon non atomique :

```java
@JsonIgnoreProperties(ignoreUnknown = true)
public record AlerterState(String mint, String pool, Long lastProcessedCandleTs, Long updatedAt) {}
```

```java
@Component
public class AlerterStateReader {
    private static final TypeReference<Map<String, AlerterState>> TYPE = new TypeReference<>() {};
    private final Path file;
    private final JsonMapper mapper;

    public AlerterStateReader(@Value("${watchlist.state-file}") String file, JsonMapper mapper) {
        this.file = Path.of(file).toAbsolutePath().normalize();
        this.mapper = mapper;
    }

    // Optional.empty() = état momentanément illisible (l'alerteur est en train d'écrire).
    public Optional<Map<String, AlerterState>> read() {
        for (int attempt = 1; attempt <= 3; attempt++) {
            try {
                if (!Files.exists(file)) return Optional.of(Map.of());
                return Optional.of(mapper.readValue(Files.readString(file, StandardCharsets.UTF_8), TYPE));
            } catch (IOException | JacksonException e) {
                try { Thread.sleep(100); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); break; }
            }
        }
        return Optional.empty();
    }
}
```

**`WatchlistService`**. Les méthodes qui écrivent sont `synchronized` et relisent toujours le
fichier d'abord (RG-12) :

```java
public synchronized WatchlistEntry add(String rawMint, String rawLabel) throws IOException {
    String mint = rawMint == null ? "" : rawMint.trim();
    if (!SolanaAddress.isValid(mint)) throw new InvalidMintException(mint);            // 400
    String label = cleanLabel(rawLabel);                                             // RG-04, 400 si > 40
    List<WatchlistEntry> entries = repository.read();                                // relecture
    if (entries.stream().anyMatch(e -> e.mint().equals(mint))) throw new DuplicateMintException(mint); // 409
    WatchlistEntry entry = new WatchlistEntry(mint, label);
    entries.add(entry);
    repository.write(entries);
    return entry;
}

public enum WatchStatus { PENDING_FIRST_CYCLE, NO_POOL, WARMING_UP, RETRYING, WATCHING }

static WatchStatus statusOf(AlerterState s) {
    if (s == null) return WatchStatus.PENDING_FIRST_CYCLE;
    boolean hasPool = s.pool() != null;
    boolean evaluated = s.lastProcessedCandleTs() != null;
    if (!evaluated) return hasPool ? WatchStatus.WARMING_UP : WatchStatus.NO_POOL;
    return hasPool ? WatchStatus.WATCHING : WatchStatus.RETRYING;
}
```

`rename(mint, label)` et `remove(mint)` suivent le même schéma : relecture, puis 404 si le token
est absent, puis écriture. Le `{mint}` des URL sert **uniquement** de clé de recherche, jamais à
construire un chemin de fichier.

---

## 6. Contrat d'API

Préfixe `/api`, JSON en UTF-8. Toutes les erreurs ont la forme
`{ "error": "<CODE>", "message": "<texte français affichable tel quel>" }`. Elles sont produites
par un `@RestControllerAdvice` (`ApiExceptionHandler`), et les `IOException` deviennent
`500 IO_ERROR`. Le message d'`INVALID_WATCHLIST_FILE` cite le chemin du fichier et la position de
l'erreur de syntaxe.

| Méthode & chemin | Corps | Succès | Erreurs |
|---|---|---|---|
| `GET /api/health` | — | `200 { "status": "ok" }` | — |
| `GET /api/watchlist` | — | `200` (ci-dessous) | `409 INVALID_WATCHLIST_FILE` |
| `POST /api/watchlist` | `{ "mint", "label"? }` | `201` entrée créée | `400 INVALID_MINT`, `400 INVALID_LABEL`, `409 DUPLICATE_MINT`, `409 INVALID_WATCHLIST_FILE` |
| `PATCH /api/watchlist/{mint}` | `{ "label": "..." \| null }` | `200` entrée modifiée | `400 INVALID_LABEL`, `404 NOT_FOUND`, `409 INVALID_WATCHLIST_FILE` |
| `DELETE /api/watchlist/{mint}` | — | `204` | `404 NOT_FOUND`, `409 INVALID_WATCHLIST_FILE` |

```json
{
  "alerter": { "lastActivityMs": 1791035219807, "active": true, "stateReadable": true },
  "items": [
    {
      "mint": "NKEda5nHhNGgjrE9nDdMvaEmkmJ96qqxzBVZEcKmjSg",
      "label": "NKE",
      "status": "WATCHING",
      "pool": "6kRoMyYBuz4ReLmLyuqiTtSpVB61hAGRrD6xYBrotsBC",
      "lastProcessedCandleTs": 1791034200
    }
  ]
}
```

Si l'état est vide, `lastActivityMs` vaut `null` et `active` vaut `false`. Si l'état est
momentanément illisible, `stateReadable` vaut `false` et chaque `status` vaut `null` (« statut
indisponible »). Les items sont dans l'ordre du fichier.

---

## 7. Purge de l'état dans l'alerteur (RG-05)

Seul changement côté Node, dans `runCycle` (`indicator-alerter/index.ts`). La purge s'applique
aussi quand la watchlist est vide :

```ts
async function runCycle(config: IndicatorAlerterConfig, notifiers: Notifier[]): Promise<void> {
    const watchlist = await readWatchlist(config.watchlistFilePath);
    const state = await readState(config.stateFilePath);

    // RG-05 : un token retiré de la watchlist oublie son état, pour qu'un ré-ajout reparte
    // d'un amorçage silencieux au lieu de rattraper des bougies anciennes.
    const watched = new Set(watchlist.map((e) => e.mint));
    const purged = Object.keys(state).filter((mint) => !watched.has(mint));
    for (const mint of purged) delete state[mint];

    if (watchlist.length === 0) {
        if (purged.length > 0) await writeState(config.stateFilePath, state);
        logger.info("indicator-alerter.cycle.empty_watchlist");
        return;
    }
    // … suite inchangée (Promise.allSettled sur processEntry, puis writeState)
}
```

Un token retiré **pendant** un cycle n'est purgé qu'au cycle suivant, ce qui est sans conséquence.
Cette purge est utile dès maintenant, même avec l'édition manuelle.

Deux cas limites à garder en tête :
- **JSON invalide → aucune purge.** `readWatchlist` lève une erreur avant la purge, et le cycle est
  sauté sans toucher à l'état. Une faute de frappe dans le fichier ne fait donc pas perdre l'état
  de tous les tokens. **Ne pas** déplacer la purge avant la lecture de la watchlist, ni rattraper
  cette erreur en la traitant comme une liste vide.
- **Fichier absent → tout l'état est purgé**, puisque `readWatchlist` renvoie une liste vide. C'est
  voulu : chaque token re-ajouté repartira d'un amorçage silencieux. L'écriture atomique du service
  Java (§5.3) ne fait jamais disparaître le fichier, même un instant.

---

## 8. Page `/watchlist`

- **Routage** : `{ to: "/watchlist", label: "Watchlist" }` dans `NAV_ITEMS`, et
  `<Route path="/watchlist" element={<WatchlistPage />} />` dans `src/App.tsx`.
- **Proxy** (`vite.config.ts`) : `server.proxy` et `preview.proxy` avec
  `{ "/api": "http://127.0.0.1:8080" }`. Si le port change, le lire avec `loadEnv` plutôt que de le
  coder en dur.
- **Types** :

```ts
type WatchStatus = "PENDING_FIRST_CYCLE" | "NO_POOL" | "WARMING_UP" | "RETRYING" | "WATCHING";
interface WatchlistItem { mint: string; label?: string; status: WatchStatus | null; pool: string | null; lastProcessedCandleTs: number | null }
interface WatchlistResponse { alerter: { lastActivityMs: number | null; active: boolean; stateReadable: boolean }; items: WatchlistItem[] }
interface ApiError { error: string; message: string }
```

- **Rafraîchissement** : `GET /api/watchlist` au montage, puis toutes les 30 s (`setInterval` dans
  un `useEffect` nettoyé), et immédiatement après chaque modification.
- **Service injoignable** : le proxy répond `500`, `502` ou `504` sans corps `ApiError`, ou `fetch`
  lève une `TypeError`. Afficher alors le bandeau « Service watchlist injoignable — lance
  `npm run watchlist-api` ». Le reste de la SPA n'est pas affecté.
- **Alerteur inactif** (§4) : bandeau « Alerteur inactif ou en erreur depuis X min — voir ses logs ;
  les changements seront pris en compte à son prochain cycle réussi ».
- **Erreurs métier** : afficher `message` tel quel ; pour une réponse non JSON, repli sur
  `readApiFailure` / `formatApiFailure` (`src/lib/apiError.ts`).
- **Validation côté client** : `isValidSolanaAddress`, extraite de `TokenScannerPage.tsx` vers
  `src/lib/` et partagée. Le service revalide de toute façon.
- **Retrait** : confirmation dans la ligne (« Retirer » → « Confirmer ? » / « Annuler »), sans
  `window.confirm`.
- **Affichage** : tableau monospace en styles en ligne, comme les autres pages. Colonnes : label
  (modifiable), CA abrégé et copiable, statut (§4), dernière bougie évaluée, actions. Liens
  DexScreener et GeckoTerminal quand le pool est connu. Sous le formulaire : « Pris en compte au
  prochain cycle de l'alerteur (≤ 2 min). »

---

## 9. Lancement

Scripts à ajouter à `package.json` :

```json
"watchlist-api": "cd watchlist-api && mvnw spring-boot:run",
"up": "concurrently -k -n web,alerter,api -c cyan,magenta,yellow \"npm:dev\" \"npm:indicator-alerter\" \"npm:watchlist-api\""
```

- Sous Windows, npm lance les scripts avec `cmd.exe` : `mvnw` résout `mvnw.cmd`, avec
  `watchlist-api/` comme dossier de travail, d'où les chemins `../` du §5.2.
- `up` demande `npm i -D concurrently` (Q2) ; `-k` arrête les trois services si l'un tombe.
- Dans IntelliJ : ajouter `watchlist-api/pom.xml` comme projet Maven, et régler le dossier de
  travail de la configuration d'exécution sur `watchlist-api/`.

---

## 10. Lots

Chaque lot est utilisable seul. Le service se teste avec `curl` avant que la page existe.

| Lot | Contenu | Priorité | Effort | Vérification |
|---|---|---|---|---|
| 0 | Purge de l'état (§7) | Must | ~30 min | `npx tsc -b`, `npm run lint` ; retirer un token du JSON → absent de `state.json` au cycle suivant ; le remettre → log `bootstrap`, aucune alerte |
| 1 | Générer `watchlist-api/` (§5.1), `application.properties`, `watchlist-api/target/` dans `.gitignore`, script `watchlist-api`, `GET /api/health` | Must | S | `curl http://127.0.0.1:8080/api/health` → `{"status":"ok"}` ; le même appel sur l'IP locale du PC **échoue** (RG-08) |
| 2 | `SolanaAddress`, `WatchlistEntry`, `WatchlistRepository`, `WatchlistService`, `WatchlistController`, `ApiExceptionHandler` + tests | Must | M | `mvnw test` ; les `curl` ci-dessous ; JSON cassé à la main → `409` et fichier inchangé |
| 3 | `AlerterStateReader`, statuts, activité de l'alerteur + tests | Must | S | Avec l'alerteur lancé : `PENDING_FIRST_CYCLE` puis `WATCHING` ; CA sans pool → `NO_POOL` ; alerteur arrêté > 6 min → `active: false` |
| 4 | Proxy, route, `WatchlistPage`, extraction de `isValidSolanaAddress` | Must | M | `npx tsc -b`, `npm run lint`, scénario du §11 |
| 5 | `concurrently` + script `up` | Should | S | `npm run up` lance les trois services ; Ctrl+C les arrête tous |
| 6 | `CLAUDE.md` (commandes, section `watchlist-api/`), `.env.example` (`WATCHLIST_API_PORT`), statut de ce document | Must | S | Relecture |

Commandes de vérification du Lot 2 :

```bash
curl -s http://127.0.0.1:8080/api/watchlist
curl -s -X POST http://127.0.0.1:8080/api/watchlist -H "content-type: application/json" \
     -d '{"mint":"Ge87EtsjwRQbHaqQmKRno69RFTwh9bfSsm99XNxTpump","label":"Jimothy"}'   # 201
curl -s -X POST http://127.0.0.1:8080/api/watchlist -H "content-type: application/json" \
     -d '{"mint":"pasunCA"}'                                                          # 400 INVALID_MINT
curl -s -X PATCH http://127.0.0.1:8080/api/watchlist/Ge87EtsjwRQbHaqQmKRno69RFTwh9bfSsm99XNxTpump \
     -H "content-type: application/json" -d '{"label":"Jimothy 🦝"}'                   # 200
curl -s -X DELETE -o /dev/null -w "%{http_code}\n" \
     http://127.0.0.1:8080/api/watchlist/Ge87EtsjwRQbHaqQmKRno69RFTwh9bfSsm99XNxTpump  # 204
```

**Estimation** : environ 1,5 à 2 jours au total (Lot 0 : 30 min ; Lots 1-3 : ½ à 1 journée ;
Lot 4 : ½ journée ; Lots 5-6 : 1 h).

---

## 11. Tests et définition de « terminé »

**Tests Java** (`cd watchlist-api && mvnw test`, JUnit 5 fourni par Spring Boot) :
- `SolanaAddress` : vrais CA (NKE, Jimothy) ; trop court ; caractère hors alphabet (`0 O I l`) ;
  bon gabarit mais ≠ 32 octets.
- `WatchlistRepository` (`@TempDir`) : absent ou vide → liste vide ; mélange chaînes et objets ;
  doublons ; **JSON invalide → exception et fichier inchangé** ; aller-retour identique ; aucun
  `.tmp` restant.
- `AlerterStateReader` : absent → vide ; contenu tronqué → `Optional.empty()` ; champs inconnus
  ignorés.
- `statusOf` : les 5 statuts.
- `WatchlistController` : `@WebMvcTest` (starter `spring-boot-starter-webmvc-test`, service simulé
  avec `@MockitoBean`) pour les codes HTTP du §6.

Côté TypeScript (pas de test runner) : `npx tsc -b` et `npm run lint`.

**Scénario de bout en bout :**
1. `npm run up`, puis ouvrir `http://localhost:5173/watchlist` ;
2. ajouter un vrai CA avec un label → ligne « ⏳ En attente du premier cycle », `watchlist.json` à
   jour ;
3. attendre au plus 2 min → log `indicator-alerter.bootstrap`, statut « ✅ Surveillé », **aucune
   alerte** Discord ni Telegram ;
4. renommer le token → `watchlist.json` à jour ;
5. retirer le token → ligne supprimée ; au cycle suivant, `state.json` ne le contient plus ;
6. arrêter le service Java → bandeau « injoignable » ; l'alerteur continue normalement ;
7. `npx tsc -b`, `npm run lint` et `mvnw test` passent.

---

## 12. Risques

| Risque | Mitigation |
|---|---|
| Écarts d'API Jackson 3 / Spring Boot 4 avec les exemples | Exemples limités aux appels stables ; corriger les imports à la compilation |
| Renommage atomique refusé par Windows pendant une lecture de l'alerteur | Réessais courts (§5.3) ; au pire une erreur 500 affichée, sans perte |
| `state.json` lu pendant que Node l'écrit | Réessais + `stateReadable: false` |
| JSON écrit incompatible avec l'alerteur (cycles sautés) | Format RG-11 ; test d'aller-retour ; vérifier un cycle de l'alerteur après chaque écriture au Lot 2 |
| Port 8080 occupé | `WATCHLIST_API_PORT` + `loadEnv` côté Vite |
| Deux stacks à maintenir (Node + Java) | Assumé (décision d'Enzo) ; service minuscule, un seul starter, contrat limité à deux fichiers |

---

## 13. Impacts sur l'existant

Fichiers **nouveaux** : `watchlist-api/` et `src/pages/WatchlistPage.tsx`.

Fichiers **modifiés** : `indicator-alerter/index.ts` (§7), `src/App.tsx`, `vite.config.ts`,
`package.json` (scripts et `concurrently`), `.gitignore` (`watchlist-api/target/`),
`.env.example`, `CLAUDE.md`, et `TokenScannerPage.tsx` (import de `isValidSolanaAddress` depuis
`src/lib/`).

Non impactés : `tsconfig*.json` (Java hors de `tsc`), ESLint (`**/*.{ts,tsx}` uniquement),
`alerter/`, le format de `watchlist.json` et la détection des signaux.

---

## 14. Questions ouvertes

| # | Question | Hypothèse en attendant |
|---|---|---|
| Q1 | Le port 8080 est-il libre ? (`Get-NetTCPConnection -LocalPort 8080 -State Listen`) | Oui ; sinon `WATCHLIST_API_PORT` |
| Q2 | Ajouter `concurrently` (devDependency) pour `npm run up` ? | Oui (Lot 5, Should) |
| Q3 | 40 caractères pour un label, est-ce suffisant ? | Oui |
