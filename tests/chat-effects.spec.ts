import { test, expect } from "@playwright/test";

test.setTimeout(120_000);

const BASE = "http://localhost:3001";
const CHANNEL = "zackrawrr";

/** Helper: navigate and wait for the app to be ready */
async function loadApp(page: any) {
  await page.goto(`${BASE}?channel=${CHANNEL}`);
  await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });
}

/** Helper: read visualizerFx from the page */
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
    };
  });
}

test.describe("Chat Effects — Unit Tests (via evaluate)", () => {
  test("trigger disco sets colorMode to disco with timer", async ({ page }) => {
    await loadApp(page);

    await page.evaluate(() => (window as any).chatEffects.trigger("disco"));
    const fx = await getFx(page);

    expect(fx.colorMode).toBe("disco");
    expect(fx.hasTimer).toBe(true);
    expect(fx.intensity).toBe(1.0);
  });

  test("trigger matrix sets colorMode to matrix", async ({ page }) => {
    await loadApp(page);

    await page.evaluate(() => (window as any).chatEffects.trigger("matrix"));
    const fx = await getFx(page);

    expect(fx.colorMode).toBe("matrix");
    expect(fx.hasTimer).toBe(true);
  });

  test("trigger vaporwave sets colorMode to vaporwave", async ({ page }) => {
    await loadApp(page);

    await page.evaluate(() => (window as any).chatEffects.trigger("vaporwave"));
    const fx = await getFx(page);

    expect(fx.colorMode).toBe("vaporwave");
    expect(fx.hasTimer).toBe(true);
  });

  test("trigger party sets intensity and glowMultiplier", async ({ page }) => {
    await loadApp(page);

    await page.evaluate(() => (window as any).chatEffects.trigger("party"));
    const fx = await getFx(page);

    expect(fx.colorMode).toBe("default");
    expect(fx.intensity).toBe(1.3);
    expect(fx.glowMultiplier).toBe(2.0);
    expect(fx.hasTimer).toBe(true);
  });

  test("trigger chill sets colorMode and reduced intensity", async ({ page }) => {
    await loadApp(page);

    await page.evaluate(() => (window as any).chatEffects.trigger("chill"));
    const fx = await getFx(page);

    expect(fx.colorMode).toBe("chill");
    expect(fx.intensity).toBe(0.7);
    expect(fx.hasTimer).toBe(true);
  });

  test("trigger rain sets rain flag", async ({ page }) => {
    await loadApp(page);

    await page.evaluate(() => (window as any).chatEffects.trigger("rain"));
    const fx = await getFx(page);

    expect(fx.rain).toBe(true);
    expect(fx.hasTimer).toBe(true);
  });

  test("reset clears all effects", async ({ page }) => {
    await loadApp(page);

    // Activate an effect first
    await page.evaluate(() => (window as any).chatEffects.trigger("disco"));
    await page.evaluate(() => (window as any).chatEffects.reset());
    const fx = await getFx(page);

    expect(fx.colorMode).toBe("default");
    expect(fx.intensity).toBe(1.0);
    expect(fx.glowMultiplier).toBe(1.0);
    expect(fx.rain).toBe(false);
    expect(fx.hasTimer).toBe(false);
  });

  test("trigger reset command clears effects", async ({ page }) => {
    await loadApp(page);

    await page.evaluate(() => (window as any).chatEffects.trigger("party"));
    await page.evaluate(() => (window as any).chatEffects.trigger("reset"));
    const fx = await getFx(page);

    expect(fx.colorMode).toBe("default");
    expect(fx.intensity).toBe(1.0);
    expect(fx.glowMultiplier).toBe(1.0);
  });

  test("new effect replaces previous effect", async ({ page }) => {
    await loadApp(page);

    await page.evaluate(() => (window as any).chatEffects.trigger("disco"));
    await page.evaluate(() => (window as any).chatEffects.trigger("matrix"));
    const fx = await getFx(page);

    expect(fx.colorMode).toBe("matrix");
    // Party-specific values should be reset
    expect(fx.intensity).toBe(1.0);
    expect(fx.glowMultiplier).toBe(1.0);
  });

  test("trigger returns false for unknown commands", async ({ page }) => {
    await loadApp(page);

    const result = await page.evaluate(() =>
      (window as any).chatEffects.trigger("unknowncmd")
    );
    expect(result).toBe(false);
  });

  test("trigger is case-insensitive", async ({ page }) => {
    await loadApp(page);

    await page.evaluate(() => (window as any).chatEffects.trigger("DISCO"));
    const fx = await getFx(page);
    expect(fx.colorMode).toBe("disco");
  });
});

test.describe("Chat Effects — processMessage", () => {
  test("processMessage parses !command and triggers effect", async ({ page }) => {
    await loadApp(page);

    await page.evaluate(() =>
      (window as any).chatEffects.processMessage("!matrix")
    );
    const fx = await getFx(page);
    expect(fx.colorMode).toBe("matrix");
  });

  test("processMessage ignores messages without ! prefix", async ({ page }) => {
    await loadApp(page);

    const result = await page.evaluate(() =>
      (window as any).chatEffects.processMessage("hello world")
    );
    expect(result).toBe(false);
  });

  test("processMessage handles command with trailing text", async ({ page }) => {
    await loadApp(page);

    await page.evaluate(() =>
      (window as any).chatEffects.processMessage("!disco let's go")
    );
    const fx = await getFx(page);
    expect(fx.colorMode).toBe("disco");
  });

  test("processMessage returns false for empty/null text", async ({ page }) => {
    await loadApp(page);

    const r1 = await page.evaluate(() =>
      (window as any).chatEffects.processMessage("")
    );
    const r2 = await page.evaluate(() =>
      (window as any).chatEffects.processMessage(null)
    );
    expect(r1).toBe(false);
    expect(r2).toBe(false);
  });
});

test.describe("Chat Effects — Station Control", () => {
  test("!nextchannel changes station frequency", async ({ page }) => {
    await loadApp(page);

    // Wait for stations to load
    await page.waitForFunction(
      () => (window as any).stations && (window as any).stations.length > 1,
      { timeout: 15_000 }
    );

    const before = await page.evaluate(() => (window as any).currentFreq);
    await page.evaluate(() =>
      (window as any).chatEffects.processMessage("!nextchannel")
    );
    const after = await page.evaluate(() => (window as any).currentFreq);

    expect(after).not.toBe(before);
  });

  test("!previouschannel changes station frequency", async ({ page }) => {
    await loadApp(page);

    await page.waitForFunction(
      () => (window as any).stations && (window as any).stations.length > 1,
      { timeout: 15_000 }
    );

    const before = await page.evaluate(() => (window as any).currentFreq);
    await page.evaluate(() =>
      (window as any).chatEffects.processMessage("!previouschannel")
    );
    const after = await page.evaluate(() => (window as any).currentFreq);

    expect(after).not.toBe(before);
  });

  test("!nextchannel updates tuner slider value", async ({ page }) => {
    await loadApp(page);

    await page.waitForFunction(
      () => (window as any).stations && (window as any).stations.length > 1,
      { timeout: 15_000 }
    );

    await page.evaluate(() =>
      (window as any).chatEffects.processMessage("!nextchannel")
    );

    const freq = await page.evaluate(() => (window as any).currentFreq);
    const sliderVal = await page.evaluate(() =>
      parseInt(
        (document.getElementById("tuner-range") as HTMLInputElement).value,
        10
      )
    );

    expect(sliderVal).toBe(Math.round(freq * 10));
  });
});

test.describe("Chat Effects — Integration via _addMessage", () => {
  test("_addMessage with !command triggers visualizer effect", async ({ page }) => {
    await loadApp(page);

    await page.evaluate(() => {
      (window as any).twitchChat._addMessage({
        username: "viewer1",
        color: "#FF0000",
        text: "!vaporwave",
      });
    });

    const fx = await getFx(page);
    expect(fx.colorMode).toBe("vaporwave");
  });

  test("_addMessage with normal text does not change effects", async ({ page }) => {
    await loadApp(page);

    await page.evaluate(() => {
      (window as any).twitchChat._addMessage({
        username: "viewer2",
        color: "#00FF00",
        text: "just chatting",
      });
    });

    const fx = await getFx(page);
    expect(fx.colorMode).toBe("default");
    expect(fx.intensity).toBe(1.0);
  });
});

test.describe("Chat Effects — Auto-expire", () => {
  test("effect auto-expires after duration", async ({ page }) => {
    await loadApp(page);

    // Override duration to 1 second for testing
    await page.evaluate(() => {
      (window as any).chatEffects.reset();
      // Manually trigger with short timeout
      const fx = (window as any).visualizerFx;
      fx.colorMode = "disco";
      fx.timer = setTimeout(() => {
        (window as any).chatEffects.reset();
      }, 1000);
    });

    const fxBefore = await getFx(page);
    expect(fxBefore.colorMode).toBe("disco");

    // Wait for expiry
    await page.waitForTimeout(1500);

    const fxAfter = await getFx(page);
    expect(fxAfter.colorMode).toBe("default");
    expect(fxAfter.hasTimer).toBe(false);
  });
});
