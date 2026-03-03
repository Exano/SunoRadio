import express from "express";
import { createServer } from "http";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const app = express();
const PORT = 3001;

const SUNO_API = "https://studio-api.prod.suno.com/api/playlist";
const SOURCE_PLAYLISTS = [
  "07653cdf-8f72-430e-847f-9ab8ac05af40", // trending
  "new_songs",
  "weekly_trending",
  "top_songs",
];

// --- FM Stations ---

interface Station {
  freq: string;
  name: string;
  keywords: string[];
}

const STATIONS: Station[] = [
  { freq: "88.1", name: "Classical",       keywords: ["classical", "orchestra", "symphonic", "piano solo", "cello", "violin solo", "chamber", "baroque", "romantic era", "concerto", "sonata"] },
  { freq: "89.1", name: "Ambient",         keywords: ["ambient", "drone", "new age", "meditation", "chillout", "atmospheric", "ethereal", "space music", "soundscape"] },
  { freq: "89.9", name: "Jazz",            keywords: ["jazz", "swing", "big band", "bossa", "crooner", "scat", "bebop", "cool jazz", "fusion jazz", "smooth jazz"] },
  { freq: "90.7", name: "Blues",           keywords: ["blues", "delta blues", "chicago blues", "blues rock", "slide guitar", "12-bar", "boogie"] },
  { freq: "91.5", name: "Soul",            keywords: ["soul", "motown", "neo-soul", "northern soul", "southern soul", "classic soul"] },
  { freq: "92.3", name: "R&B",             keywords: ["r&b", "rnb", "r and b", "slow jam", "sultry", "sensual", "contemporary r&b"] },
  { freq: "93.1", name: "Funk",            keywords: ["funk", "funky", "p-funk", "go-go", "boogie funk", "electro-funk", "slap bass"] },
  { freq: "93.9", name: "Disco",           keywords: ["disco", "nu-disco", "italo disco", "eurodisco", "disco funk", "hustle", "studio 54"] },
  { freq: "94.7", name: "Rock",            keywords: ["rock", "hard rock", "classic rock", "guitar hero", "arena rock", "glam rock", "prog rock", "psychedelic rock"] },
  { freq: "95.5", name: "Alt Rock",        keywords: ["alt rock", "alternative rock", "indie rock", "grunge", "post-punk", "shoegaze", "britpop", "garage rock"] },
  { freq: "96.3", name: "Metal",           keywords: ["metal", "heavy metal", "death metal", "black metal", "thrash", "metalcore", "doom metal", "power metal", "nu metal"] },
  { freq: "97.1", name: "Indie",           keywords: ["indie", "lo-fi", "bedroom pop", "dream pop", "indie folk", "indie electronic", "art pop", "chamber pop"] },
  { freq: "97.7", name: "Folk",            keywords: ["folk", "acoustic", "singer-songwriter", "americana", "celtic", "traditional", "bluegrass", "world folk"] },
  { freq: "98.5", name: "Punk",            keywords: ["punk", "punk rock", "pop punk", "post-hardcore", "ska punk", "hardcore", "emo", "skate punk"] },
  { freq: "99.3", name: "Hip-Hop",         keywords: ["hip hop", "hip-hop", "rap", "boom bap", "freestyle", "conscious rap", "old school hip hop"] },
  { freq: "99.9", name: "West Coast Rap",  keywords: ["west coast", "g-funk", "hyphy", "west coast rap", "lowrider", "cali rap"] },
  { freq: "100.7", name: "Gangsta Rap",    keywords: ["gangsta", "trap", "drill", "grime", "808", "chopper", "street", "dirty south", "crunk"] },
  { freq: "101.3", name: "Pop",            keywords: ["pop", "dance-pop", "electropop", "synth-pop", "power pop", "teen pop", "bubblegum"] },
  { freq: "101.9", name: "K-Pop / J-Pop",  keywords: ["k-pop", "kpop", "j-pop", "jpop", "j-rock", "visual-kei", "city pop", "anime", "idol"] },
  { freq: "102.7", name: "Latin",          keywords: ["latin", "reggaeton", "salsa", "bachata", "cumbia", "bossa nova", "samba", "mariachi", "latin pop", "tropical"] },
  { freq: "103.5", name: "Country",        keywords: ["country", "country rock", "outlaw country", "nashville", "honky tonk", "western", "country pop", "red dirt"] },
  { freq: "104.3", name: "Trance",         keywords: ["trance", "psytrance", "uplifting trance", "progressive trance", "goa", "eurodance", "hard trance"] },
  { freq: "105.1", name: "Techno",         keywords: ["techno", "detroit techno", "minimal techno", "acid techno", "industrial techno", "hard techno", "tech house"] },
  { freq: "105.9", name: "House",          keywords: ["house", "deep house", "progressive house", "future house", "tropical house", "acid house", "chicago house", "afro house"] },
  { freq: "106.7", name: "Dubstep & Bass", keywords: ["dubstep", "bass", "riddim", "dnb", "drum and bass", "jungle", "breakbeat", "glitch hop", "edm", "electronic"] },
  { freq: "107.5", name: "Cinematic",      keywords: ["cinematic", "soundtrack", "film score", "epic", "trailer music", "orchestral", "hans zimmer", "movie"] },
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

let allSongs: SunoClip[] = [];
let allSongsFetchedAt = 0;
const CACHE_TTL = 2 * 60 * 1000;

async function fetchAllSongs(): Promise<SunoClip[]> {
  const now = Date.now();
  if (allSongs.length > 0 && now - allSongsFetchedAt < CACHE_TTL) {
    return allSongs;
  }

  const songs: SunoClip[] = [];
  const seen = new Set<string>();

  for (const playlistId of SOURCE_PLAYLISTS) {
    for (let page = 0; page < 10; page++) {
      try {
        const res = await fetch(`${SUNO_API}/${playlistId}?page=${page}`);
        if (!res.ok) break;
        const data: any = await res.json();
        const clips = data.playlist_clips;
        if (!clips || clips.length === 0) break;

        for (const pc of clips) {
          if (seen.has(pc.clip.id)) continue;
          seen.add(pc.clip.id);
          songs.push({
            id: pc.clip.id,
            title: pc.clip.title,
            artist: pc.display_name,
            handle: pc.handle,
            playCount: pc.clip.play_count,
            upvoteCount: pc.clip.upvote_count,
            duration: pc.clip.metadata?.duration ?? pc.clip.duration ?? 0,
            audioUrl: pc.clip.audio_url,
            imageUrl: pc.clip.image_url,
            tags: pc.clip.metadata?.tags ?? "",
            modelVersion: pc.clip.major_model_version,
            createdAt: pc.created_at,
          });
        }
      } catch {
        // Gracefully skip playlists that 404 or fail
        break;
      }
    }
  }

  allSongs = songs;
  allSongsFetchedAt = now;
  console.log(`Fetched ${songs.length} total songs from Suno`);
  return songs;
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

function classifySongs(songs: SunoClip[], station: Station): SunoClip[] {
  const matches = songs.filter((song) => {
    const text = (song.tags + " " + song.title).toLowerCase();
    return station.keywords.some((kw) => text.includes(kw));
  });

  // Sort by play count (most popular first)
  matches.sort((a, b) => b.playCount - a.playCount);

  // Top 50 by popularity, then hourly seeded shuffle so order rotates
  const top = matches.slice(0, MAX_PER_STATION);
  const hourlySeed = Math.floor(Date.now() / (3600 * 1000)); // changes every hour
  return seededShuffle(top, hourlySeed);
}

// --- Routes ---

app.get("/api/stations", (_req, res) => {
  res.json(STATIONS.map((s) => ({ freq: s.freq, name: s.name })));
});

for (const station of STATIONS) {
  app.get(`/api/station/${station.freq}`, async (_req, res) => {
    try {
      const songs = await fetchAllSongs();
      const stationSongs = classifySongs(songs, station);
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
});
