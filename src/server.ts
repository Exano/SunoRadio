import express from "express";
import { createServer } from "http";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";
import { WebSocketServer, WebSocket } from "ws";
import Database from "better-sqlite3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// --- SQLite cache setup ---
const dataDir = join(root, "data");
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, "cache.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS station_cache (
    freq TEXT PRIMARY KEY,
    songs TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  )
`);

const getStmt = db.prepare("SELECT songs, fetched_at FROM station_cache WHERE freq = ?");
const setStmt = db.prepare("INSERT OR REPLACE INTO station_cache (freq, songs, fetched_at) VALUES (?, ?, ?)");

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

const SUNO_SEARCH_API = "https://studio-api.prod.suno.com/api/search";

// --- FM Stations ---

interface Station {
  freq: string;
  name: string;
  searchTerm: string;
  keywords: string[];
  playlistId?: string;
}

const STATIONS: Station[] = [
  { freq: "88.1", name: "Classical",       searchTerm: "classical",       keywords: ["classical", "orchestra", "symphonic", "piano solo", "cello", "violin solo", "chamber", "baroque", "romantic era", "concerto", "sonata"] },
  { freq: "88.5", name: "Furbals Lofi",   searchTerm: "lofi",            keywords: ["lo-fi", "lofi", "chill beats", "chillhop"], playlistId: "3cf598ac-f892-49d4-a9be-de9bf8cbfd96" },
  { freq: "89.1", name: "Ambient",         searchTerm: "ambient",         keywords: ["ambient", "drone", "new age", "meditation", "chillout", "atmospheric", "ethereal", "space music", "soundscape"] },
  { freq: "89.9", name: "Jazz",            searchTerm: "jazz",            keywords: ["jazz", "swing", "big band", "bossa", "crooner", "scat", "bebop", "cool jazz", "fusion jazz", "smooth jazz"] },
  { freq: "90.7", name: "Blues",           searchTerm: "blues",           keywords: ["blues", "delta blues", "chicago blues", "blues rock", "slide guitar", "12-bar", "boogie"] },
  { freq: "91.5", name: "Soul",            searchTerm: "soul",            keywords: ["soul", "motown", "neo-soul", "northern soul", "southern soul", "classic soul"] },
  { freq: "92.3", name: "R&B",             searchTerm: "r&b",             keywords: ["r&b", "rnb", "r and b", "slow jam", "sultry", "sensual", "contemporary r&b"] },
  { freq: "93.1", name: "Funk",            searchTerm: "funk",            keywords: ["funk", "funky", "p-funk", "go-go", "boogie funk", "electro-funk", "slap bass"] },
  { freq: "93.9", name: "Disco",           searchTerm: "disco",           keywords: ["disco", "nu-disco", "italo disco", "eurodisco", "disco funk", "hustle", "studio 54"] },
  { freq: "94.7", name: "Rock",            searchTerm: "rock",            keywords: ["rock", "hard rock", "classic rock", "guitar hero", "arena rock", "glam rock", "prog rock", "psychedelic rock"] },
  { freq: "95.5", name: "Alt Rock",        searchTerm: "alternative rock", keywords: ["alt rock", "alternative rock", "indie rock", "grunge", "post-punk", "shoegaze", "britpop", "garage rock"] },
  { freq: "96.3", name: "Metal",           searchTerm: "metal",           keywords: ["metal", "heavy metal", "death metal", "black metal", "thrash", "metalcore", "doom metal", "power metal", "nu metal"] },
  { freq: "97.1", name: "Indie",           searchTerm: "indie",           keywords: ["indie", "lo-fi", "bedroom pop", "dream pop", "indie folk", "indie electronic", "art pop", "chamber pop"] },
  { freq: "97.7", name: "Folk",            searchTerm: "folk",            keywords: ["folk", "acoustic", "singer-songwriter", "americana", "celtic", "traditional", "bluegrass", "world folk"] },
  { freq: "98.5", name: "Punk",            searchTerm: "punk",            keywords: ["punk", "punk rock", "pop punk", "post-hardcore", "ska punk", "hardcore", "emo", "skate punk"] },
  { freq: "99.3", name: "Hip-Hop",         searchTerm: "hip hop",         keywords: ["hip hop", "hip-hop", "rap", "boom bap", "freestyle", "conscious rap", "old school hip hop"] },
  { freq: "99.9", name: "West Coast Rap",  searchTerm: "west coast rap",  keywords: ["west coast", "g-funk", "hyphy", "west coast rap", "lowrider", "cali rap"] },
  { freq: "100.7", name: "Gangsta Rap",    searchTerm: "trap",            keywords: ["gangsta", "trap", "drill", "grime", "808", "chopper", "street", "dirty south", "crunk"] },
  { freq: "101.3", name: "Pop",            searchTerm: "pop",             keywords: ["pop", "dance-pop", "electropop", "synth-pop", "power pop", "teen pop", "bubblegum"] },
  { freq: "101.9", name: "K-Pop / J-Pop",  searchTerm: "kpop",            keywords: ["k-pop", "kpop", "j-pop", "jpop", "j-rock", "visual-kei", "city pop", "anime", "idol"] },
  { freq: "102.7", name: "Latin",          searchTerm: "latin",           keywords: ["latin", "reggaeton", "salsa", "bachata", "cumbia", "bossa nova", "samba", "mariachi", "latin pop", "tropical"] },
  { freq: "103.5", name: "Country",        searchTerm: "country",         keywords: ["country", "country rock", "outlaw country", "nashville", "honky tonk", "western", "country pop", "red dirt"] },
  { freq: "104.3", name: "Trance",         searchTerm: "trance",          keywords: ["trance", "psytrance", "uplifting trance", "progressive trance", "goa", "eurodance", "hard trance"] },
  { freq: "105.1", name: "Techno",         searchTerm: "techno",          keywords: ["techno", "detroit techno", "minimal techno", "acid techno", "industrial techno", "hard techno", "tech house"] },
  { freq: "105.9", name: "House",          searchTerm: "house",           keywords: ["house", "deep house", "progressive house", "future house", "tropical house", "acid house", "chicago house", "afro house"] },
  { freq: "106.7", name: "Dubstep & Bass", searchTerm: "dubstep",         keywords: ["dubstep", "bass", "riddim", "dnb", "drum and bass", "jungle", "breakbeat", "glitch hop", "edm", "electronic"] },
  { freq: "107.5", name: "Cinematic",      searchTerm: "cinematic",       keywords: ["cinematic", "soundtrack", "film score", "epic", "trailer music", "orchestral", "hans zimmer", "movie"] },
];

const MAX_PER_STATION = 50;

// --- Data layer ---

interface SunoClip {
  id: string;
  title: string;
  artist: string;
  handle: string;
  playCount: number;
  upvoteCount: number;
  duration: number;
  audioUrl: string;
  imageUrl: string;
  tags: string;
  modelVersion: string;
  createdAt: string;
}

const CACHE_TTL = 20 * 60 * 1000;
const stationCache = new Map<string, { songs: SunoClip[]; fetchedAt: number }>();

function getFromSqlite(freq: string): { songs: SunoClip[]; fetchedAt: number } | null {
  const row = getStmt.get(freq) as { songs: string; fetched_at: number } | undefined;
  if (!row) return null;
  return { songs: JSON.parse(row.songs), fetchedAt: row.fetched_at };
}

function saveToSqlite(freq: string, songs: SunoClip[]) {
  setStmt.run(freq, JSON.stringify(songs), Date.now());
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Serialize all Suno API calls so we never blast concurrent requests
let requestQueue: Promise<any> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const p = requestQueue.then(fn, fn);
  requestQueue = p.then(() => delay(350), () => delay(350));
  return p;
}

async function searchSuno(term: string, retries = 2): Promise<SunoClip[]> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(SUNO_SEARCH_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          search_queries: [{ term, search_type: "tag_song", size: 50 }],
        }),
      });
      if (res.status === 429) {
        console.log(`Rate limited searching "${term}", retry ${attempt + 1}...`);
        await delay(2000 * (attempt + 1));
        continue;
      }
      if (!res.ok) return [];
      const data: any = await res.json();

      const bucket = data?.result?.[""] ?? data?.result?.[Object.keys(data?.result ?? {})[0]];
      const results = bucket?.result ?? [];
      return results.map((s: any) => ({
        id: s.id,
        title: s.title,
        artist: s.display_name ?? "",
        handle: s.handle ?? "",
        playCount: s.play_count ?? 0,
        upvoteCount: s.upvote_count ?? 0,
        duration: s.metadata?.duration ?? s.duration ?? 0,
        audioUrl: s.audio_url ?? "",
        imageUrl: s.image_url ?? "",
        tags: s.metadata?.tags ?? "",
        modelVersion: s.major_model_version ?? "",
        createdAt: s.created_at ?? "",
      }));
    } catch {
      if (attempt < retries) {
        await delay(1000 * (attempt + 1));
        continue;
      }
      return [];
    }
  }
  return [];
}

async function fetchPlaylist(playlistId: string, retries = 2): Promise<SunoClip[]> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${SUNO_SEARCH_API.replace("/search", "")}/playlist/${playlistId}`);
      if (res.status === 429) {
        console.log(`Rate limited fetching playlist ${playlistId}, retry ${attempt + 1}...`);
        await delay(2000 * (attempt + 1));
        continue;
      }
      if (!res.ok) return [];
      const data: any = await res.json();
      const clips = data?.playlist_clips ?? [];
      return clips
        .filter((c: any) => c.clip?.audio_url)
        .map((c: any) => {
          const s = c.clip;
          return {
            id: s.id,
            title: s.title,
            artist: s.display_name ?? "",
            handle: s.handle ?? "",
            playCount: s.play_count ?? 0,
            upvoteCount: s.upvote_count ?? 0,
            duration: s.metadata?.duration ?? s.duration ?? 0,
            audioUrl: s.audio_url ?? "",
            imageUrl: s.image_url ?? "",
            tags: s.metadata?.tags ?? "",
            modelVersion: s.major_model_version ?? "",
            createdAt: s.created_at ?? "",
          };
        });
    } catch {
      if (attempt < retries) {
        await delay(1000 * (attempt + 1));
        continue;
      }
      return [];
    }
  }
  return [];
}

async function fetchStationSongs(station: Station): Promise<SunoClip[]> {
  const now = Date.now();

  // 1. Check in-memory cache
  const cached = stationCache.get(station.freq);
  if (cached && now - cached.fetchedAt < CACHE_TTL) {
    return cached.songs;
  }

  // 2. Check SQLite cache
  const sqlRow = getFromSqlite(station.freq);
  if (sqlRow && now - sqlRow.fetchedAt < CACHE_TTL) {
    stationCache.set(station.freq, sqlRow);
    return sqlRow.songs;
  }

  // 3. Fetch from Suno API
  let songs: SunoClip[] = [];

  // Try playlist first if configured
  if (station.playlistId) {
    songs = await enqueue(() => fetchPlaylist(station.playlistId!));
  }

  // Fall back to search
  if (songs.length === 0) {
    songs = await enqueue(() => searchSuno(station.searchTerm));

    // Fallback: try keywords one by one if primary search returned nothing
    if (songs.length === 0) {
      for (const kw of station.keywords) {
        if (kw === station.searchTerm) continue;
        songs = await enqueue(() => searchSuno(kw));
        if (songs.length > 0) break;
      }
    }
  }

  // 4. Save to SQLite + in-memory
  console.log(`Fetched ${songs.length} songs for ${station.name} from API`);
  saveToSqlite(station.freq, songs);
  stationCache.set(station.freq, { songs, fetchedAt: now });
  return songs;
}

// Pre-warm all station caches: load SQLite rows first, only API-fetch missing stations
async function warmUpCaches() {
  console.log("Warming up station caches...");

  let loadedFromDb = 0;
  let fetchedFromApi = 0;
  const toFetch: Station[] = [];

  // Load all existing SQLite rows into memory (serve stale on startup)
  for (const station of STATIONS) {
    const row = getFromSqlite(station.freq);
    if (row && row.songs.length > 0) {
      stationCache.set(station.freq, row);
      loadedFromDb++;
    } else {
      toFetch.push(station);
    }
  }

  console.log(`Loaded ${loadedFromDb} stations from SQLite cache, ${toFetch.length} need fresh fetch`);

  // Only fetch stations with no SQLite data at all
  for (const station of toFetch) {
    await fetchStationSongs(station);
    fetchedFromApi++;
  }

  console.log(`Warm-up complete: ${loadedFromDb} cached, ${fetchedFromApi} fetched from API`);
}

// Deterministic seeded shuffle — same seed produces same order
function seededShuffle(arr: SunoClip[], seed: number): SunoClip[] {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    // Simple LCG PRNG
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = ((s >>> 0) % (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function classifySongs(songs: SunoClip[]): SunoClip[] {
  // Sort by play count (most popular first)
  const sorted = [...songs].sort((a, b) => b.playCount - a.playCount);
  const top = sorted.slice(0, MAX_PER_STATION);
  const hourlySeed = Math.floor(Date.now() / (3600 * 1000));
  return seededShuffle(top, hourlySeed);
}

// --- Routes ---

app.get("/api/stations", (_req, res) => {
  res.json(STATIONS.map((s) => ({ freq: s.freq, name: s.name })));
});

for (const station of STATIONS) {
  app.get(`/api/station/${station.freq}`, async (_req, res) => {
    try {
      const songs = await fetchStationSongs(station);
      const stationSongs = classifySongs(songs);
      res.json({
        freq: station.freq,
        name: station.name,
        totalSongs: stationSongs.length,
        songs: stationSongs,
      });
    } catch (err) {
      console.error(`Error for ${station.freq}:`, err);
      res.status(502).json({ error: "Failed to fetch from Suno" });
    }
  });
}

app.use(express.static(join(root, "public")));

// --- HTTP + WebSocket Server ---

const server = createServer(app);

const wss = new WebSocketServer({ server });

// --- Binary protocol constants ---
const MSG_BATCH = 0x01;
const MSG_WELCOME = 0x02;
const MSG_LEAVE = 0x03;
const ENTRY_SIZE = 6; // uint16 id + uint16 freq*10 + uint16 hue
const MAX_CONNECTIONS = 10000;

interface ConnectedUser {
  id: number;
  freq: number;
  hue: number;
  lastMsg: number;
}

const users = new Map<WebSocket, ConnectedUser>();
let nextUserId = 1;
const freeIds: number[] = [];
const dirtyUsers = new Set<number>();

function allocId(): number {
  return freeIds.length > 0 ? freeIds.pop()! : nextUserId++;
}

function freeId(id: number) {
  freeIds.push(id);
}

// Build a leave frame: [0x03, uint16 id]
function buildLeaveFrame(id: number): Buffer {
  const buf = Buffer.alloc(3);
  buf[0] = MSG_LEAVE;
  buf.writeUInt16BE(id, 1);
  return buf;
}

// Build a welcome frame: [0x02, uint16 myId, uint16 count, ...entries]
function buildWelcomeFrame(myId: number, others: ConnectedUser[]): Buffer {
  const buf = Buffer.alloc(1 + 2 + 2 + others.length * ENTRY_SIZE);
  buf[0] = MSG_WELCOME;
  buf.writeUInt16BE(myId, 1);
  buf.writeUInt16BE(others.length, 3);
  let offset = 5;
  for (const u of others) {
    buf.writeUInt16BE(u.id, offset);
    buf.writeUInt16BE(Math.round(u.freq * 10), offset + 2);
    buf.writeUInt16BE(u.hue, offset + 4);
    offset += ENTRY_SIZE;
  }
  return buf;
}

// Batched broadcast: runs every 100ms, sends one binary frame with all dirty users
setInterval(() => {
  if (dirtyUsers.size === 0) return;

  // Collect dirty user data
  const entries: { id: number; freq: number; hue: number }[] = [];
  for (const [, u] of users) {
    if (dirtyUsers.has(u.id)) {
      entries.push(u);
    }
  }
  dirtyUsers.clear();

  if (entries.length === 0) return;

  // Build batch frame: [0x01, uint16 count, ...entries]
  const buf = Buffer.alloc(1 + 2 + entries.length * ENTRY_SIZE);
  buf[0] = MSG_BATCH;
  buf.writeUInt16BE(entries.length, 1);
  let offset = 3;
  for (const e of entries) {
    buf.writeUInt16BE(e.id, offset);
    buf.writeUInt16BE(Math.round(e.freq * 10), offset + 2);
    buf.writeUInt16BE(e.hue, offset + 4);
    offset += ENTRY_SIZE;
  }

  for (const [ws] of users) {
    if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount <= 65536) {
      ws.send(buf);
    }
  }
}, 100);

wss.on("connection", (ws) => {
  // Connection limit
  if (users.size >= MAX_CONNECTIONS) {
    ws.close(1013, "Server full");
    return;
  }

  const id = allocId();
  const user: ConnectedUser = { id, freq: 98.1, hue: 30, lastMsg: 0 };
  users.set(ws, user);

  ws.on("message", (raw) => {
    const now = Date.now();
    if (now - user.lastMsg < 50) return;
    user.lastMsg = now;

    let msg: any;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (msg.type === "hello") {
      user.hue = typeof msg.hue === "number" ? Math.max(0, Math.min(359, Math.round(msg.hue))) : user.hue;
      user.freq = typeof msg.freq === "number" ? msg.freq : user.freq;

      // Send binary welcome with all current users
      const others: ConnectedUser[] = [];
      for (const [, u] of users) {
        if (u.id !== id) others.push(u);
      }
      ws.send(buildWelcomeFrame(id, others));

      // Mark as dirty so others pick up this new user in next batch
      dirtyUsers.add(id);
    } else if (msg.type === "tune") {
      if (typeof msg.freq === "number") {
        user.freq = msg.freq;
        dirtyUsers.add(id);
      }
    }
  });

  ws.on("close", () => {
    users.delete(ws);
    dirtyUsers.delete(id);
    freeId(id);
    // Leave is sent immediately (infrequent, must be timely)
    const frame = buildLeaveFrame(id);
    for (const [client] of users) {
      if (client.readyState === WebSocket.OPEN && client.bufferedAmount <= 65536) {
        client.send(frame);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`SunoTime Radio running at http://localhost:${PORT}`);
  warmUpCaches();
});
