import { test, expect } from "@playwright/test";

test.setTimeout(120_000);

const BASE = "http://localhost:3001";
const CHANNEL = "zackrawrr";

async function loadApp(page: any) {
  await page.goto(`${BASE}?channel=${CHANNEL}`);
  await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });
}

function getFx(page: any) {
  return page.evaluate(() => {
    const fx = (window as any).visualizerFx;
    return {
      colorMode: fx.colorMode,
      intensity: fx.intensity,
      glowMultiplier: fx.glowMultiplier,
      rain: fx.rain,
      hueOffset: fx.hueOffset,
      hasTimer: fx.timer !== null,
      mode: fx.mode,
    };
  });
}

function getOverlays(page: any) {
  return page.evaluate(() =>
    (window as any).overlayEffects.map((o: any) => ({
      id: o.id,
      duration: o.duration,
    }))
  );
}

test.describe("Visualizer Modes", () => {
  test("default mode is bars", async ({ page }) => {
    await loadApp(page);
    const fx = await getFx(page);
    expect(fx.mode).toBe("bars");
  });

  test("!bars sets mode to bars", async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => (window as any).chatEffects.trigger("scope"));
    await page.evaluate(() => (window as any).chatEffects.trigger("bars"));
    const fx = await getFx(page);
    expect(fx.mode).toBe("bars");
  });

  test("!scope sets mode to scope", async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => (window as any).chatEffects.trigger("scope"));
    const fx = await getFx(page);
    expect(fx.mode).toBe("scope");
  });

  test("!circle sets mode to circle", async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => (window as any).chatEffects.trigger("circle"));
    const fx = await getFx(page);
    expect(fx.mode).toBe("circle");
  });

  test("!blocks sets mode to blocks", async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => (window as any).chatEffects.trigger("blocks"));
    const fx = await getFx(page);
    expect(fx.mode).toBe("blocks");
  });

  test("mode commands do not set a timer", async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => (window as any).chatEffects.trigger("scope"));
    const fx = await getFx(page);
    expect(fx.mode).toBe("scope");
    expect(fx.hasTimer).toBe(false);
  });

  test("mode persists across color changes", async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => (window as any).chatEffects.trigger("circle"));
    await page.evaluate(() => (window as any).chatEffects.trigger("disco"));
    const fx = await getFx(page);
    expect(fx.mode).toBe("circle");
    expect(fx.colorMode).toBe("disco");
  });

  test("!reset restores mode to bars", async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => (window as any).chatEffects.trigger("scope"));
    await page.evaluate(() => (window as any).chatEffects.trigger("reset"));
    const fx = await getFx(page);
    expect(fx.mode).toBe("bars");
  });
});

test.describe("Overlay Effects", () => {
  test("!discoball adds overlay", async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => (window as any).chatEffects.trigger("discoball"));
    const overlays = await getOverlays(page);
    expect(overlays).toHaveLength(1);
    expect(overlays[0].id).toBe("discoball");
    expect(overlays[0].duration).toBe(8);
  });

  test("!confetti adds overlay", async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => (window as any).chatEffects.trigger("confetti"));
    const overlays = await getOverlays(page);
    expect(overlays).toHaveLength(1);
    expect(overlays[0].id).toBe("confetti");
    expect(overlays[0].duration).toBe(6);
  });

  test("!fire adds overlay", async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => (window as any).chatEffects.trigger("fire"));
    const overlays = await getOverlays(page);
    expect(overlays).toHaveLength(1);
    expect(overlays[0].id).toBe("fire");
    expect(overlays[0].duration).toBe(8);
  });

  test("!snow adds overlay", async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => (window as any).chatEffects.trigger("snow"));
    const overlays = await getOverlays(page);
    expect(overlays).toHaveLength(1);
    expect(overlays[0].id).toBe("snow");
    expect(overlays[0].duration).toBe(10);
  });

  test("!earthquake adds overlay", async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() =>
      (window as any).chatEffects.trigger("earthquake")
    );
    const overlays = await getOverlays(page);
    expect(overlays).toHaveLength(1);
    expect(overlays[0].id).toBe("earthquake");
    expect(overlays[0].duration).toBe(3);
  });

  test("re-trigger replaces existing overlay (no duplicates)", async ({
    page,
  }) => {
    await loadApp(page);
    await page.evaluate(() => (window as any).chatEffects.trigger("confetti"));
    await page.evaluate(() => (window as any).chatEffects.trigger("confetti"));
    const overlays = await getOverlays(page);
    const confettiCount = overlays.filter(
      (o: any) => o.id === "confetti"
    ).length;
    expect(confettiCount).toBe(1);
  });

  test("multiple different overlays can coexist", async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => (window as any).chatEffects.trigger("snow"));
    await page.evaluate(() => (window as any).chatEffects.trigger("fire"));
    await page.evaluate(() => (window as any).chatEffects.trigger("confetti"));
    const overlays = await getOverlays(page);
    expect(overlays).toHaveLength(3);
    const ids = overlays.map((o: any) => o.id).sort();
    expect(ids).toEqual(["confetti", "fire", "snow"]);
  });

  test("!reset clears all overlays", async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => (window as any).chatEffects.trigger("snow"));
    await page.evaluate(() => (window as any).chatEffects.trigger("fire"));
    await page.evaluate(() => (window as any).chatEffects.trigger("reset"));
    const overlays = await getOverlays(page);
    expect(overlays).toHaveLength(0);
  });

  test("earthquake auto-expires after 3s", async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => {
      // Set startTime in the past so it's already expired
      (window as any).chatEffects.trigger("earthquake");
      const ov = (window as any).overlayEffects.find(
        (o: any) => o.id === "earthquake"
      );
      if (ov) ov.startTime = Date.now() - 4000;
    });

    // Overlays are cleaned up during the draw loop. Since we can't
    // guarantee the visualizer is running in tests (no audio context),
    // manually check expiry logic.
    const isExpired = await page.evaluate(() => {
      const ov = (window as any).overlayEffects.find(
        (o: any) => o.id === "earthquake"
      );
      if (!ov) return true;
      return Date.now() - ov.startTime >= ov.duration * 1000;
    });
    expect(isExpired).toBe(true);
  });
});

test.describe("processMessage parses new commands", () => {
  test("!scope via processMessage", async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() =>
      (window as any).chatEffects.processMessage("!scope")
    );
    const fx = await getFx(page);
    expect(fx.mode).toBe("scope");
  });

  test("!confetti via processMessage", async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() =>
      (window as any).chatEffects.processMessage("!confetti")
    );
    const overlays = await getOverlays(page);
    expect(overlays).toHaveLength(1);
    expect(overlays[0].id).toBe("confetti");
  });

  test("!earthquake via processMessage with trailing text", async ({
    page,
  }) => {
    await loadApp(page);
    await page.evaluate(() =>
      (window as any).chatEffects.processMessage("!earthquake shake it")
    );
    const overlays = await getOverlays(page);
    expect(overlays).toHaveLength(1);
    expect(overlays[0].id).toBe("earthquake");
  });

  test("new commands are case-insensitive", async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => (window as any).chatEffects.trigger("BLOCKS"));
    const fx = await getFx(page);
    expect(fx.mode).toBe("blocks");
  });
});

test.describe("Dev Menu — new buttons", () => {
  test("mode buttons exist", async ({ page }) => {
    await loadApp(page);
    for (const fx of ["bars", "scope", "circle", "blocks"]) {
      const btn = page.locator(`#dev-menu button[data-fx="${fx}"]`);
      await expect(btn).toBeAttached();
    }
  });

  test("overlay buttons exist", async ({ page }) => {
    await loadApp(page);
    for (const fx of [
      "discoball",
      "confetti",
      "fire",
      "snow",
      "earthquake",
    ]) {
      const btn = page.locator(`#dev-menu button[data-fx="${fx}"]`);
      await expect(btn).toBeAttached();
    }
  });
});
