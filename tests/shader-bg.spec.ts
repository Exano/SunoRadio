import { test, expect } from "@playwright/test";

test.setTimeout(120_000);

const BASE = "http://localhost:3001";

// All shader names that should exist
const ALL_SHADERS = [
  "sunset",
  "plasma",
  "fractal",
  "ocean",
  "winamp",
  "chromatic",
  "warp",
  "kaleidoscope",
  "voronoi",
];

test.describe("Shader Background System", () => {
  test("WebGL2 detection runs on init", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    const webgl2 = await page.evaluate(() => (window as any).webgl2Available);
    // Chromium supports WebGL2
    expect(webgl2).toBe(true);
  });

  test("shader auto-starts on first station tune", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    // Wait for station data to prefetch before tuning
    await page.waitForFunction(
      () => Object.keys((window as any).stationData || {}).length >= 5,
      { timeout: 30_000 }
    );

    // Tune to a station to trigger startVisualizer
    await page.locator("#tuner-range").fill("947");
    await page.waitForTimeout(5000);

    const state = await page.evaluate(() => ({
      active: (window as any).bgShaderState.active,
      hasGl: !!(window as any).bgShaderState.gl,
      hasProgram: !!(window as any).bgShaderState.program,
      shaderDisplay: document.getElementById("bg-shader")!.style.display,
      bgArtDisplay: document.getElementById("bg-art")!.style.display,
    }));

    console.log("Shader state after tune:", state);
    expect(state.active).toBe("sunset");
    expect(state.hasGl).toBe(true);
    expect(state.hasProgram).toBe(true);
    expect(state.shaderDisplay).toBe("block");
    expect(state.bgArtDisplay).toBe("none");
  });

  test("switching to None hides shader and shows bg-art", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(3000);

    // Tune to trigger auto-start
    await page.locator("#tuner-range").fill("947");
    await expect(page.locator('[data-testid="song-title"]')).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(1000);

    // Switch to None
    await page.evaluate(() => (window as any).initShaderBG("none"));
    await page.waitForTimeout(200);

    const state = await page.evaluate(() => ({
      active: (window as any).bgShaderState.active,
      shaderDisplay: document.getElementById("bg-shader")!.style.display,
      bgArtDisplay: document.getElementById("bg-art")!.style.display,
    }));

    expect(state.active).toBe("none");
    expect(state.shaderDisplay).toBe("none");
    expect(state.bgArtDisplay).toBe("");
  });

  test("can switch from None back to a shader (GL context reuse)", async ({
    page,
  }) => {
    await page.goto(BASE);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(3000);

    // Tune to trigger auto-start
    await page.locator("#tuner-range").fill("947");
    await expect(page.locator('[data-testid="song-title"]')).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(1000);

    // Switch to None, then back to sunset
    await page.evaluate(() => {
      (window as any).initShaderBG("none");
    });
    await page.waitForTimeout(200);

    await page.evaluate(() => {
      (window as any).initShaderBG("sunset");
    });
    await page.waitForTimeout(200);

    const state = await page.evaluate(() => ({
      active: (window as any).bgShaderState.active,
      hasGl: !!(window as any).bgShaderState.gl,
      hasProgram: !!(window as any).bgShaderState.program,
      shaderDisplay: document.getElementById("bg-shader")!.style.display,
      bgArtDisplay: document.getElementById("bg-art")!.style.display,
    }));

    console.log("State after None -> Sunset:", state);
    expect(state.active).toBe("sunset");
    expect(state.hasGl).toBe(true);
    expect(state.hasProgram).toBe(true);
    expect(state.shaderDisplay).toBe("block");
    expect(state.bgArtDisplay).toBe("none");
  });

  test("can cycle through None and multiple shaders", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(3000);

    await page.locator("#tuner-range").fill("947");
    await expect(page.locator('[data-testid="song-title"]')).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(1000);

    // Cycle: sunset -> none -> plasma -> none -> fractal -> none -> sunset
    const sequence = [
      "none",
      "plasma",
      "none",
      "fractal",
      "none",
      "sunset",
    ];

    for (const shader of sequence) {
      await page.evaluate((name) => {
        (window as any).initShaderBG(name);
      }, shader);
      await page.waitForTimeout(300);

      const active = await page.evaluate(
        () => (window as any).bgShaderState.active
      );
      expect(active).toBe(shader);

      if (shader === "none") {
        const display = await page.evaluate(
          () => document.getElementById("bg-shader")!.style.display
        );
        expect(display).toBe("none");
      } else {
        const hasProgram = await page.evaluate(
          () => !!(window as any).bgShaderState.program
        );
        expect(hasProgram).toBe(true);
      }
    }
  });

  test("all shader names compile without error", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(3000);

    await page.locator("#tuner-range").fill("947");
    await expect(page.locator('[data-testid="song-title"]')).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(1000);

    const results = await page.evaluate((shaders) => {
      const out: { name: string; ok: boolean; error?: string }[] = [];
      for (const name of shaders) {
        (window as any).initShaderBG(name);
        const st = (window as any).bgShaderState;
        out.push({
          name,
          ok: st.active === name && !!st.program,
          error: st.active !== name ? "failed to activate" : undefined,
        });
      }
      return out;
    }, ALL_SHADERS);

    console.log("Shader compile results:");
    for (const r of results) {
      console.log(`  ${r.name}: ${r.ok ? "OK" : "FAIL"} ${r.error || ""}`);
      expect(r.ok).toBe(true);
    }
  });

  test("bgShaders registry has all expected shaders", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    const shaderNames = await page.evaluate(() =>
      Object.keys((window as any).bgShaders)
    );

    for (const name of ALL_SHADERS) {
      expect(shaderNames).toContain(name);
    }
  });

  test("each shader has params array with valid ranges", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    const paramInfo = await page.evaluate(() => {
      const shaders = (window as any).bgShaders;
      const out: Record<
        string,
        { name: string; min: number; max: number; step: number; default: number }[]
      > = {};
      for (const key of Object.keys(shaders)) {
        const s = shaders[key];
        if (s && s.params) {
          out[key] = s.params;
        }
      }
      return out;
    });

    for (const [shaderName, params] of Object.entries(paramInfo)) {
      expect(params.length).toBeGreaterThan(0);
      for (const p of params) {
        expect(p.name.length).toBeGreaterThan(0);
        expect(p.min).toBeLessThan(p.max);
        expect(p.step).toBeGreaterThan(0);
        expect(p.default).toBeGreaterThanOrEqual(p.min);
        expect(p.default).toBeLessThanOrEqual(p.max);
      }
    }

    console.log(
      `Validated params for ${Object.keys(paramInfo).length} shaders`
    );
  });

  test("shader param values persist to localStorage", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    // Activate plasma and change a param (no need to tune — just call directly)
    await page.evaluate(() => {
      (window as any).initShaderBG("plasma");
      (window as any).bgShaderState.paramValues[0] = 1.5;
      (window as any).saveShaderParamValue("plasma", "Speed", 1.5);
    });

    // Verify localStorage
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("sunotime-shader-params") || "{}")
    );
    expect(stored.plasma).toBeDefined();
    expect(stored.plasma.Speed).toBe(1.5);

    // Reload and verify param is restored
    await page.reload();
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    // Switch to plasma — should load saved params from localStorage
    await page.evaluate(() => {
      (window as any).initShaderBG("plasma");
    });

    const restoredVal = await page.evaluate(
      () => (window as any).bgShaderState.paramValues[0]
    );
    expect(restoredVal).toBe(1.5);
  });

  test("dev menu shows all shader buttons", async ({ page }) => {
    await page.goto(BASE + "?dev=1");
    await expect(page.locator("#dev-menu")).toBeVisible({ timeout: 10_000 });

    const shaderButtons = await page.evaluate(() => {
      const btns = document.querySelectorAll("button[data-shader]");
      return Array.from(btns).map((b) => b.getAttribute("data-shader"));
    });

    // Should have None + all shaders
    expect(shaderButtons).toContain("none");
    for (const name of [
      "sunset",
      "plasma",
      "fractal",
      "aurora",
      "ocean",
      "winamp",
      "gradient",
      "chromatic",
      "warp",
      "lava",
      "clouds",
      "kaleidoscope",
      "voronoi",
    ]) {
      expect(shaderButtons).toContain(name);
    }
    console.log(`Found ${shaderButtons.length} shader buttons in dev menu`);
  });

  test("dev menu shader buttons toggle correctly", async ({ page }) => {
    await page.goto(BASE + "?dev=1");
    await expect(page.locator("#dev-menu")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(3000);

    // Tune to trigger visualizer
    await page.locator("#tuner-range").fill("947");
    await expect(page.locator('[data-testid="song-title"]')).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(1000);

    // Click None
    await page.click('button[data-shader="none"]');
    await page.waitForTimeout(300);

    let noneActive = await page.evaluate(() =>
      document
        .querySelector('button[data-shader="none"]')!
        .classList.contains("active-fx")
    );
    expect(noneActive).toBe(true);

    // Click Plasma
    await page.click('button[data-shader="plasma"]');
    await page.waitForTimeout(300);

    const plasmaActive = await page.evaluate(() =>
      document
        .querySelector('button[data-shader="plasma"]')!
        .classList.contains("active-fx")
    );
    expect(plasmaActive).toBe(true);

    noneActive = await page.evaluate(() =>
      document
        .querySelector('button[data-shader="none"]')!
        .classList.contains("active-fx")
    );
    expect(noneActive).toBe(false);
  });

  test("shader param sliders appear for active shader", async ({ page }) => {
    await page.goto(BASE + "?dev=1");
    await expect(page.locator("#dev-menu")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(3000);

    // Tune
    await page.locator("#tuner-range").fill("947");
    await expect(page.locator('[data-testid="song-title"]')).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(1000);

    // Click Sunset to ensure params are rendered (auto-start doesn't trigger dev menu update)
    await page.click('button[data-shader="sunset"]');
    await page.waitForTimeout(300);

    const paramCount = await page.evaluate(
      () =>
        document.querySelectorAll("#dev-shader-params .dev-param-row").length
    );
    // Sunset has 4 params
    expect(paramCount).toBe(4);

    // Click None — params should disappear
    await page.click('button[data-shader="none"]');
    await page.waitForTimeout(300);

    const paramCountNone = await page.evaluate(
      () =>
        document.querySelectorAll("#dev-shader-params .dev-param-row").length
    );
    expect(paramCountNone).toBe(0);

    // Click Plasma — should show 3 params
    await page.click('button[data-shader="plasma"]');
    await page.waitForTimeout(300);

    const paramCountPlasma = await page.evaluate(
      () =>
        document.querySelectorAll("#dev-shader-params .dev-param-row").length
    );
    expect(paramCountPlasma).toBe(3);
  });

  test("bg-shader canvas is at body level with fixed positioning", async ({
    page,
  }) => {
    await page.goto(BASE);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    const canvasInfo = await page.evaluate(() => {
      const canvas = document.getElementById("bg-shader")!;
      const style = window.getComputedStyle(canvas);
      return {
        parentTag: canvas.parentElement!.tagName,
        position: style.position,
        pointerEvents: style.pointerEvents,
      };
    });

    expect(canvasInfo.parentTag).toBe("BODY");
    expect(canvasInfo.position).toBe("fixed");
    expect(canvasInfo.pointerEvents).toBe("none");
  });

  test("bass-driven bg-art breathing only runs when shader is off", async ({
    page,
  }) => {
    await page.goto(BASE);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(3000);

    // Tune to station
    await page.locator("#tuner-range").fill("947");
    await expect(page.locator('[data-testid="song-title"]')).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(2000);

    // With shader active, bg-art should be hidden
    const bgArtHidden = await page.evaluate(
      () => document.getElementById("bg-art")!.style.display
    );
    expect(bgArtHidden).toBe("none");

    // Switch to None — bg-art should be visible
    await page.evaluate(() => (window as any).initShaderBG("none"));
    await page.waitForTimeout(500);

    const bgArtVisible = await page.evaluate(
      () => document.getElementById("bg-art")!.style.display
    );
    expect(bgArtVisible).toBe("");
  });

  test("all shader params have audio field defined", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    const result = await page.evaluate(() => {
      const shaders = (window as any).bgShaders;
      const issues: string[] = [];
      for (const key of Object.keys(shaders)) {
        const s = shaders[key];
        if (!s.params) continue;
        for (const p of s.params) {
          if (p.audio === undefined) {
            issues.push(`${key}.${p.name} missing audio field`);
          }
        }
      }
      return issues;
    });

    expect(result).toEqual([]);
  });

  test("global audio reactivity persists to localStorage", async ({
    page,
  }) => {
    await page.goto(BASE);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    // Set custom audio reactivity
    await page.evaluate(() => {
      (window as any).audioReactivity = { bass: 0.5, mids: 1.5, highs: 0.0 };
      (window as any).saveAudioReactivity();
    });

    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("sunotime-audio-react") || "{}")
    );
    expect(stored.bass).toBe(0.5);
    expect(stored.mids).toBe(1.5);
    expect(stored.highs).toBe(0.0);

    // Reload and verify restoration
    await page.reload();
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    const restored = await page.evaluate(
      () => (window as any).audioReactivity
    );
    expect(restored.bass).toBe(0.5);
    expect(restored.mids).toBe(1.5);
    expect(restored.highs).toBe(0.0);
  });

  test("per-param audio checkbox toggle persists", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    // Activate sunset and disable audio on Brightness (index 1, has audio: 0.5)
    await page.evaluate(() => {
      (window as any).initShaderBG("sunset");
      (window as any).bgShaderState.paramAudioEnabled[1] = false;
      // Save to localStorage
      const all = JSON.parse(
        localStorage.getItem("sunotime-shader-audio") || "{}"
      );
      if (!all["sunset"]) all["sunset"] = {};
      all["sunset"]["Brightness"] = false;
      localStorage.setItem("sunotime-shader-audio", JSON.stringify(all));
    });

    // Reload and re-activate sunset
    await page.reload();
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    await page.evaluate(() => {
      (window as any).initShaderBG("sunset");
    });

    const enabled = await page.evaluate(
      () => (window as any).bgShaderState.paramAudioEnabled
    );
    // Brightness (index 1) should be false, Wave Amp (index 2) should still be true
    expect(enabled[1]).toBe(false);
    expect(enabled[2]).toBe(true);
  });

  test("params with audio:0 do not show Track checkbox in dev menu", async ({
    page,
  }) => {
    await page.goto(BASE + "?dev=1");
    await expect(page.locator("#dev-menu")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(3000);

    // Tune and select sunset
    await page.locator("#tuner-range").fill("947");
    await expect(page.locator('[data-testid="song-title"]')).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(1000);

    await page.click('button[data-shader="sunset"]');
    await page.waitForTimeout(300);

    const trackInfo = await page.evaluate(() => {
      const rows = document.querySelectorAll(
        "#dev-shader-params .dev-param-row"
      );
      const result: { label: string; hasTrack: boolean }[] = [];
      // Skip the first 3 rows (audio reactivity sliders) and section headers
      rows.forEach((row) => {
        const lbl = row.querySelector("label:first-child");
        const track = row.querySelector(".dev-param-track");
        if (lbl && lbl.textContent && !["Bass", "Mids", "Highs"].includes(lbl.textContent)) {
          result.push({
            label: lbl.textContent,
            hasTrack: !!track,
          });
        }
      });
      return result;
    });

    // Sunset: Speed has audio:0 (no checkbox), Brightness/Wave Amp/Color Spd have audio>0
    const speed = trackInfo.find((t) => t.label === "Speed");
    const brightness = trackInfo.find((t) => t.label === "Brightness");
    const waveAmp = trackInfo.find((t) => t.label === "Wave Amp");
    const colorSpd = trackInfo.find((t) => t.label === "Color Spd");

    expect(speed?.hasTrack).toBe(false);
    expect(brightness?.hasTrack).toBe(true);
    expect(waveAmp?.hasTrack).toBe(true);
    expect(colorSpd?.hasTrack).toBe(true);
  });

  test("audio reactivity sliders appear in dev menu", async ({ page }) => {
    await page.goto(BASE + "?dev=1");
    await expect(page.locator("#dev-menu")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(3000);

    // Tune and select a shader
    await page.locator("#tuner-range").fill("947");
    await expect(page.locator('[data-testid="song-title"]')).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(1000);

    await page.click('button[data-shader="sunset"]');
    await page.waitForTimeout(300);

    const arLabels = await page.evaluate(() => {
      const rows = document.querySelectorAll(
        "#dev-shader-params .dev-param-row"
      );
      const labels: string[] = [];
      rows.forEach((row) => {
        const lbl = row.querySelector("label:first-child");
        if (lbl && ["Bass", "Mids", "Highs"].includes(lbl.textContent || "")) {
          labels.push(lbl.textContent || "");
        }
      });
      return labels;
    });

    expect(arLabels).toContain("Bass");
    expect(arLabels).toContain("Mids");
    expect(arLabels).toContain("Highs");
  });
});
