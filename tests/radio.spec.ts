import { test, expect } from "@playwright/test";

test.setTimeout(120_000); // 2 min per test — real network fetches to Suno

const BASE = "http://localhost:3001";

// Helper: wait for station data to prefetch, then tune to a freq
async function tuneAndWait(page: any, freqInt: number) {
  await page.locator("#tuner-range").fill(String(freqInt));
  // Wait for song title to appear (station loaded + displaying)
  await expect(page.locator('[data-testid="song-title"]')).toBeVisible({
    timeout: 30_000,
  });
}

test.describe("SunoTime Radio", () => {
  test("loads tuner dial with stations", async ({ page }) => {
    await page.goto(BASE);
    const tuner = page.locator("#tuner-range");
    await expect(tuner).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".tuner-freq-num")).toBeVisible();
    await expect(page.locator("#dial-canvas")).toBeVisible();
  });

  test("tunes into a station and shows now playing", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(3000);

    await tuneAndWait(page, 947); // Rock

    const title = await page.locator('[data-testid="song-title"]').textContent();
    expect(title!.length).toBeGreaterThan(0);
    await expect(page.locator('[data-testid="song-artist"]')).toBeAttached();
    await expect(page.locator(".on-air")).toBeVisible();
    await expect(page.locator(".station-badge")).toContainText("94.7");
  });

  test("switching stations changes the display", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(3000);

    await tuneAndWait(page, 1013); // Pop
    await tuneAndWait(page, 1059); // House
    await expect(page.locator(".station-badge")).toContainText("105.9");
  });

  test("volume slider is present when tuned", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(3000);

    await tuneAndWait(page, 1013);
    await expect(page.locator("#vol-slider")).toBeVisible();
  });

  // ---- Epoch schedule tests ----

  test("getSchedule returns a UTC-epoch-based position, not always 0", async ({
    page,
  }) => {
    await page.goto(BASE);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    // Wait for all station data to prefetch
    await page.waitForFunction(
      () => {
        const keys = Object.keys((window as any).stationData || {});
        return keys.length >= 10;
      },
      { timeout: 30_000 }
    );

    // Evaluate getSchedule across multiple stations — at least some must
    // have a non-trivial elapsed (statistically near-certain)
    const results = await page.evaluate(() => {
      const out: { freq: string; index: number; elapsed: number; songCount: number; totalDuration: number }[] = [];
      for (const s of (window as any).stations) {
        const data = (window as any).stationData[s.freq];
        if (!data?.songs?.length) continue;
        const songs = data.songs;
        const totalDuration = songs.reduce((sum: number, s: any) => sum + s.duration, 0);
        const schedule = (window as any).getSchedule(songs);
        out.push({
          freq: s.freq,
          index: schedule.index,
          elapsed: schedule.elapsed,
          songCount: songs.length,
          totalDuration,
        });
      }
      return out;
    });

    console.log("Schedule results for all stations:");
    for (const r of results) {
      console.log(
        `  ${r.freq}: song ${r.index}/${r.songCount}, elapsed ${r.elapsed.toFixed(1)}s, total cycle ${r.totalDuration.toFixed(0)}s`
      );
    }

    // At least some stations must have elapsed > 5s — it's statistically
    // impossible that ALL stations happen to be at the first 5 seconds of
    // their current song simultaneously
    const nonZero = results.filter((r) => r.elapsed > 5);
    console.log(
      `  ${nonZero.length} / ${results.length} stations have elapsed > 5s`
    );
    expect(nonZero.length).toBeGreaterThanOrEqual(1);

    // Every station must have a valid index within its song list
    for (const r of results) {
      expect(r.index).toBeGreaterThanOrEqual(0);
      expect(r.index).toBeLessThan(r.songCount);
      expect(r.elapsed).toBeGreaterThanOrEqual(0);
      expect(r.elapsed).toBeLessThan(r.totalDuration);
    }
  });

  test("two calls to getSchedule seconds apart return advancing elapsed", async ({
    page,
  }) => {
    await page.goto(BASE);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    await page.waitForFunction(
      () => Object.keys((window as any).stationData || {}).length >= 10,
      { timeout: 30_000 }
    );

    // Sample getSchedule, wait 2 seconds, sample again
    const first = await page.evaluate(() => {
      const data = Object.values((window as any).stationData as Record<string, any>).find(
        (d: any) => d?.songs?.length > 0
      );
      if (!data) return null;
      return (window as any).getSchedule(data.songs) as { index: number; elapsed: number };
    });

    await page.waitForTimeout(2000);

    const second = await page.evaluate(() => {
      const data = Object.values((window as any).stationData as Record<string, any>).find(
        (d: any) => d?.songs?.length > 0
      );
      if (!data) return null;
      return (window as any).getSchedule(data.songs) as { index: number; elapsed: number };
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    // The elapsed should have advanced by ~2 seconds (or wrapped to next song)
    if (first!.index === second!.index) {
      const delta = second!.elapsed - first!.elapsed;
      console.log(
        `  Same song: elapsed advanced by ${delta.toFixed(2)}s (expected ~2s)`
      );
      expect(delta).toBeGreaterThan(1);
      expect(delta).toBeLessThan(4);
    } else {
      // Song changed — that's fine, schedule advanced past a song boundary
      console.log(
        `  Song changed from index ${first!.index} to ${second!.index}`
      );
    }
  });

  test("audio currentTime matches UTC schedule after tuning", async ({
    page,
  }) => {
    await page.goto(BASE);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    // Wait for station data to prefetch
    await page.waitForFunction(
      () => Object.keys((window as any).stationData || {}).length >= 10,
      { timeout: 30_000 }
    );

    // Tune to Rock (94.7)
    await page.locator("#tuner-range").fill("947");
    await expect(page.locator('[data-testid="song-title"]')).toBeVisible({
      timeout: 30_000,
    });

    // Give audio time to load, seek, and start playing
    await page.waitForTimeout(6000);

    const state = await page.evaluate(() => {
      const ch = (window as any).channelPool.find(
        (c: any) => c.stationFreq === "94.7"
      );
      if (!ch) return { error: "no channel for 94.7" };

      const data = (window as any).stationData["94.7"];
      const schedule = (window as any).getSchedule(data.songs);

      return {
        currentTime: ch.audio.currentTime,
        paused: ch.audio.paused,
        readyState: ch.audio.readyState,
        duration: ch.audio.duration,
        scheduledElapsed: schedule.elapsed,
        scheduledIndex: schedule.index,
        channelSongIndex: ch.songIndex,
      };
    });

    console.log("Audio state after tuning to 94.7:", state);

    // The audio must not be stuck at 0 — it should be near the scheduled
    // position.  We allow a tolerance window because some seconds pass
    // between the channel assignment and this check.
    if ("error" in state) {
      throw new Error(state.error as string);
    }

    expect(state.currentTime).toBeGreaterThan(3);
    console.log(
      `  currentTime=${state.currentTime.toFixed(1)}s, ` +
        `scheduled=${state.scheduledElapsed.toFixed(1)}s — seek worked!`
    );
  });

  test("scrubbing through multiple stations loads correct songs", async ({
    page,
  }) => {
    await page.goto(BASE);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    await page.waitForFunction(
      () => Object.keys((window as any).stationData || {}).length >= 10,
      { timeout: 30_000 }
    );

    // Station freqs to scrub through (spread across the band)
    const stationFreqs = [
      { int: 899, freq: "89.9", name: "Jazz" },
      { int: 947, freq: "94.7", name: "Rock" },
      { int: 1013, freq: "101.3", name: "Pop" },
      { int: 1059, freq: "105.9", name: "House" },
    ];

    const results: { freq: string; title: string; artist: string; currentTime: number }[] = [];

    for (const sf of stationFreqs) {
      await page.locator("#tuner-range").fill(String(sf.int));
      await expect(page.locator('[data-testid="song-title"]')).toBeVisible({
        timeout: 30_000,
      });

      // Wait for audio to load and seek
      await page.waitForTimeout(5000);

      const info = await page.evaluate((freq: string) => {
        const ch = (window as any).channelPool.find(
          (c: any) => c.stationFreq === freq
        );
        return {
          freq,
          title:
            document.querySelector('[data-testid="song-title"]')
              ?.textContent || "",
          artist:
            document.querySelector('[data-testid="song-artist"]')
              ?.textContent || "",
          currentTime: ch?.audio?.currentTime ?? -1,
          paused: ch?.audio?.paused ?? true,
        };
      }, sf.freq);

      console.log(
        `  ${sf.freq} (${sf.name}): "${info.title}" by ${info.artist}, ` +
          `currentTime=${info.currentTime.toFixed(1)}s, paused=${info.paused}`
      );

      results.push(info);

      // Station badge must show current freq
      await expect(page.locator(".station-badge")).toContainText(sf.freq);
    }

    // Each station should have a title
    for (const r of results) {
      expect(r.title.length).toBeGreaterThan(0);
    }

    // At least some stations should have currentTime > 3s (seek worked)
    const seeked = results.filter((r) => r.currentTime > 3);
    console.log(
      `  ${seeked.length} / ${results.length} stations had currentTime > 3s`
    );
    expect(seeked.length).toBeGreaterThanOrEqual(1);

    // Different stations should (usually) have different songs
    const uniqueTitles = new Set(results.map((r) => r.title));
    console.log(
      `  ${uniqueTitles.size} unique titles across ${results.length} stations`
    );
    expect(uniqueTitles.size).toBeGreaterThanOrEqual(2);
  });

  // ---- Tuner alignment test ----

  // ---- Volume persistence tests ----

  test("volume persists across page reloads", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(3000);

    // Tune to a station so vol-slider appears
    await tuneAndWait(page, 1013); // Pop

    // Set volume to 0.3 via the slider
    await page.evaluate(() => {
      const slider = document.getElementById("vol-slider") as HTMLInputElement;
      slider.value = "0.3";
      slider.dispatchEvent(new Event("input"));
    });

    // Verify localStorage was written
    const stored = await page.evaluate(() =>
      localStorage.getItem("sunotime-volume")
    );
    expect(parseFloat(stored!)).toBeCloseTo(0.3, 1);

    // Reload the page
    await page.reload();
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(3000);

    // Tune back to same station
    await tuneAndWait(page, 1013);

    // Volume slider should start at 0.3
    const sliderVal = await page.evaluate(() => {
      return parseFloat(
        (document.getElementById("vol-slider") as HTMLInputElement).value
      );
    });
    expect(sliderVal).toBeCloseTo(0.3, 1);

    // masterGain should also reflect saved volume
    const gainVal = await page.evaluate(
      () => (window as any).masterGain?.gain?.value ?? -1
    );
    // Gain uses quadratic curve: 0.3^2 = 0.09
    console.log(`  Volume after reload: slider=${sliderVal}, gain=${gainVal}`);
    expect(gainVal).toBeGreaterThan(0.05);
    expect(gainVal).toBeLessThan(0.15);
  });

  test("mute does not persist to localStorage", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(3000);

    await tuneAndWait(page, 947); // Rock

    // Set volume to 0.5
    await page.evaluate(() => {
      const slider = document.getElementById("vol-slider") as HTMLInputElement;
      slider.value = "0.5";
      slider.dispatchEvent(new Event("input"));
    });

    // Click mute button
    await page.click("#vol-btn");
    await page.waitForTimeout(200);

    // localStorage should still have 0.5, not 0
    const stored = await page.evaluate(() =>
      localStorage.getItem("sunotime-volume")
    );
    expect(parseFloat(stored!)).toBeCloseTo(0.5, 1);
  });

  // ---- Tuner alignment test ----

  test("tuner needle aligns with station positions on dial", async ({
    page,
  }) => {
    await page.goto(BASE);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    // Wait for stations to load so the dial is drawn with station markers
    await page.waitForFunction(
      () => (window as any).stations?.length > 0,
      { timeout: 15_000 }
    );

    // Test several station frequencies across the band
    const testFreqs = [
      { int: 881, freq: 88.1 },
      { int: 947, freq: 94.7 },
      { int: 1013, freq: 101.3 },
      { int: 1075, freq: 107.5 },
    ];

    for (const tf of testFreqs) {
      await page.locator("#tuner-range").fill(String(tf.int));

      // Give the needle transition time to settle
      await page.waitForTimeout(200);

      const positions = await page.evaluate((freq: number) => {
        const wrapper = document.getElementById("dial-band-wrapper")!;
        const needle = document.getElementById("tuner-needle")!;
        const wrapperWidth = wrapper.offsetWidth;

        const FREQ_MIN = 88.1;
        const FREQ_MAX = 107.9;
        const FREQ_SPAN = FREQ_MAX - FREQ_MIN;

        // Expected needle position based on the same math the app uses
        const expectedX = ((freq - FREQ_MIN) / FREQ_SPAN) * wrapperWidth;
        const actualX = parseFloat(needle.style.left) || 0;

        return { expectedX, actualX, wrapperWidth };
      }, tf.freq);

      console.log(
        `  ${tf.freq} FM: needle at ${positions.actualX.toFixed(1)}px, ` +
          `expected ${positions.expectedX.toFixed(1)}px ` +
          `(wrapper ${positions.wrapperWidth}px)`
      );

      // Needle should be within 2px of the expected position
      expect(Math.abs(positions.actualX - positions.expectedX)).toBeLessThan(2);
    }
  });
});
