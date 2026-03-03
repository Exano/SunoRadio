import express from "express";
import { createServer } from "http";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

const SUNO_SEARCH_API = "https://studio-api.prod.suno.com/api/search";

// --- FM Stations ---

interface Station {
  freq: string;
  name: string;
  searchTerm: string;
  keywords: string[];
}

const STATIONS: Station[] = [
  { freq: "88.1", name: "Classical",       searchTerm: "classical",       keywords: ["classical", "orchestra", "symphonic", "piano solo", "cello", "violin solo", "chamber", "baroque", "romantic era", "concerto", "sonata"] },
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

const CACHE_TTL = 2 * 60 * 1000;
const stationCache = new Map<string, { songs: SunoClip[]; fetchedAt: number }>();

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

async function fetchStationSongs(station: Station): Promise<SunoClip[]> {
  const now = Date.now();
  const cached = stationCache.get(station.freq);
  if (cached && now - cached.fetchedAt < CACHE_TTL) {
    return cached.songs;
  }

  let songs = await enqueue(() => searchSuno(station.searchTerm));

  // Fallback: try keywords one by one if primary search returned nothing
  if (songs.length === 0) {
    for (const kw of station.keywords) {
      if (kw === station.searchTerm) continue;
      songs = await enqueue(() => searchSuno(kw));
      if (songs.length > 0) break;
    }
  }

  console.log(`Fetched ${songs.length} songs for ${station.name}`);
  stationCache.set(station.freq, { songs, fetchedAt: now });
  return songs;
}

// Pre-warm all station caches sequentially on startup
async function warmUpCaches() {
  console.log("Warming up station caches...");
  for (const station of STATIONS) {
    await fetchStationSongs(station);
  }
  console.log("All station caches warm.");
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

interface ConnectedUser {
  id: string;
  freq: number;
  color: string;
  lastMsg: number;
}

const users = new Map<WebSocket, ConnectedUser>();
let nextUserId = 1;

function broadcast(data: object, exclude?: WebSocket) {
  const msg = JSON.stringify(data);
  for (const [ws] of users) {
    if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

wss.on("connection", (ws) => {
  const id = "u" + nextUserId++;
  const user: ConnectedUser = { id, freq: 98.1, color: "#ff4f00", lastMsg: 0 };
  users.set(ws, user);

  ws.on("message", (raw) => {
    const now = Date.now();
    // Rate limit: drop messages faster than 50ms apart
    if (now - user.lastMsg < 50) return;
    user.lastMsg = now;

    let msg: any;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (msg.type === "hello") {
      user.color = typeof msg.color === "string" ? msg.color.slice(0, 20) : user.color;
      user.freq = typeof msg.freq === "number" ? msg.freq : user.freq;

      // Send welcome with all current users
      const allUsers = [];
      for (const [, u] of users) {
        if (u.id !== id) {
          allUsers.push({ id: u.id, freq: u.freq, color: u.color });
        }
      }
      ws.send(JSON.stringify({ type: "welcome", id, users: allUsers }));

      // Notify others about the new user
      broadcast({ type: "user", id, freq: user.freq, color: user.color }, ws);
    } else if (msg.type === "tune") {
      if (typeof msg.freq === "number") {
        user.freq = msg.freq;
        broadcast({ type: "user", id, freq: user.freq, color: user.color }, ws);
      }
    }
  });

  ws.on("close", () => {
    users.delete(ws);
    broadcast({ type: "leave", id });
  });
});

server.listen(PORT, () => {
  console.log(`SunoTime Radio running at http://localhost:${PORT}`);
  warmUpCaches();
});
