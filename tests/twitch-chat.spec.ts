import { test, expect } from "@playwright/test";

test.setTimeout(120_000);

const BASE = "http://localhost:3001";
const CHANNEL = "zackrawrr";

test.describe("Twitch Chat — Unit Tests (via evaluate)", () => {
  test("parseMessage: PRIVMSG with IRCv3 tags", async ({ page }) => {
    await page.goto(`${BASE}?channel=${CHANNEL}`);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    const result = await page.evaluate(() => {
      return (window as any).twitchChat.parseMessage(
        "@color=#FF4500;display-name=TestUser;id=abc123 :testuser!testuser@testuser.tmi.twitch.tv PRIVMSG #zackrawrr :Hello World"
      );
    });

    expect(result).toEqual({
      username: "TestUser",
      color: "#FF4500",
      text: "Hello World",
    });
  });

  test("parseMessage: missing color falls back to deterministic HSL", async ({
    page,
  }) => {
    await page.goto(`${BASE}?channel=${CHANNEL}`);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    const result = await page.evaluate(() => {
      return (window as any).twitchChat.parseMessage(
        "@display-name=NoColorUser;id=456 :nocoloruser!nocoloruser@nocoloruser.tmi.twitch.tv PRIVMSG #zackrawrr :test msg"
      );
    });

    expect(result.username).toBe("NoColorUser");
    expect(result.color).toMatch(/^hsl\(\d+, 70%, 60%\)$/);
    expect(result.text).toBe("test msg");
  });

  test("parseMessage: no tags at all", async ({ page }) => {
    await page.goto(`${BASE}?channel=${CHANNEL}`);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    const result = await page.evaluate(() => {
      return (window as any).twitchChat.parseMessage(
        ":someuser!someuser@someuser.tmi.twitch.tv PRIVMSG #zackrawrr :plain message"
      );
    });

    expect(result.username).toBe("someuser");
    expect(result.color).toMatch(/^hsl\(/);
    expect(result.text).toBe("plain message");
  });

  test("parseMessage: returns null for non-PRIVMSG lines", async ({
    page,
  }) => {
    await page.goto(`${BASE}?channel=${CHANNEL}`);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    const results = await page.evaluate(() => {
      const parse = (window as any).twitchChat.parseMessage;
      return [
        parse(":tmi.twitch.tv 001 justinfan12345 :Welcome, GLHF!"),
        parse(":tmi.twitch.tv 353 justinfan12345 = #ch :user1 user2"),
        parse("PING :tmi.twitch.tv"),
        parse(""),
      ];
    });

    for (const r of results) {
      expect(r).toBeNull();
    }
  });

  test("hashColor: deterministic and valid HSL", async ({ page }) => {
    await page.goto(`${BASE}?channel=${CHANNEL}`);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    const results = await page.evaluate(() => {
      const hash = (window as any).twitchChat.hashColor;
      return {
        a1: hash("testuser"),
        a2: hash("testuser"),
        b: hash("differentuser"),
      };
    });

    expect(results.a1).toBe(results.a2); // deterministic
    expect(results.a1).toMatch(/^hsl\(\d+, 70%, 60%\)$/);
    expect(results.b).toMatch(/^hsl\(\d+, 70%, 60%\)$/);
  });

  test("injected message is XSS-safe (textContent, not innerHTML)", async ({
    page,
  }) => {
    await page.goto(`${BASE}?channel=${CHANNEL}`);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    // Enable sidebar
    await page.locator("#chat-toggle").click();
    await expect(page.locator("#chat-sidebar")).toHaveClass(/visible/);

    // Inject XSS attempt
    await page.evaluate(() => {
      (window as any).twitchChat._addMessage({
        username: "hacker",
        color: "#ff0000",
        text: '<img src=x onerror=alert(1)><script>alert("xss")</script>',
      });
    });

    // Text should be rendered literally, not as HTML
    const msgText = await page
      .locator(".chat-msg .chat-text")
      .last()
      .textContent();
    expect(msgText).toContain("<script>");

    // No script/img elements injected
    const scriptCount = await page.locator("#chat-messages script").count();
    const imgCount = await page.locator("#chat-messages img").count();
    expect(scriptCount).toBe(0);
    expect(imgCount).toBe(0);
  });
});

test.describe("Twitch Chat — UI Behavior", () => {
  test("toggle button hidden without ?channel param", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#chat-toggle")).toBeHidden();
  });

  test("toggle button visible with ?channel param", async ({ page }) => {
    await page.goto(`${BASE}?channel=${CHANNEL}`);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#chat-toggle")).toBeVisible();
  });

  test("sidebar header shows channel name", async ({ page }) => {
    await page.goto(`${BASE}?channel=${CHANNEL}`);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#chat-channel-name")).toHaveText(
      `#${CHANNEL}`
    );
  });

  test("cycling: Off → Sidebar → Ticker → Off", async ({ page }) => {
    await page.goto(`${BASE}?channel=${CHANNEL}`);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    const btn = page.locator("#chat-toggle");
    const sidebar = page.locator("#chat-sidebar");
    const ticker = page.locator("#chat-ticker");
    const label = page.locator("#chat-mode-label");

    // Initially off
    await expect(sidebar).not.toHaveClass(/visible/);
    await expect(ticker).not.toHaveClass(/visible/);
    await expect(btn).not.toHaveClass(/active/);

    // Click 1 → Sidebar
    await btn.click();
    await expect(sidebar).toHaveClass(/visible/);
    await expect(ticker).not.toHaveClass(/visible/);
    await expect(label).toHaveText("CHAT");
    await expect(btn).toHaveClass(/active/);

    // Click 2 → Ticker
    await btn.click();
    await expect(sidebar).not.toHaveClass(/visible/);
    await expect(ticker).toHaveClass(/visible/);
    await expect(label).toHaveText("TICKER");
    await expect(btn).toHaveClass(/active/);

    // Click 3 → Off
    await btn.click();
    await expect(sidebar).not.toHaveClass(/visible/);
    await expect(ticker).not.toHaveClass(/visible/);
    await expect(btn).not.toHaveClass(/active/);
  });

  test("mode persists to localStorage across reload", async ({ page }) => {
    await page.goto(`${BASE}?channel=${CHANNEL}`);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    // Enable sidebar
    await page.locator("#chat-toggle").click();
    await expect(page.locator("#chat-sidebar")).toHaveClass(/visible/);

    const stored = await page.evaluate(() =>
      localStorage.getItem("sunotime-chat-mode")
    );
    expect(stored).toBe("sidebar");

    // Reload
    await page.reload();
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    // Should restore sidebar mode
    await expect(page.locator("#chat-sidebar")).toHaveClass(/visible/);
    await expect(page.locator("#chat-mode-label")).toHaveText("CHAT");
  });

  test("sidebar populates from buffer when switching modes", async ({
    page,
  }) => {
    await page.goto(`${BASE}?channel=${CHANNEL}`);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    // Inject messages while still in "off" mode
    await page.evaluate(() => {
      for (let i = 0; i < 5; i++) {
        (window as any).twitchChat._addMessage({
          username: `user${i}`,
          color: `hsl(${i * 60}, 70%, 60%)`,
          text: `message ${i}`,
        });
      }
    });

    // Now enable sidebar — should rebuild from buffer
    await page.locator("#chat-toggle").click();
    await expect(page.locator("#chat-sidebar")).toHaveClass(/visible/);

    const count = await page.locator(".chat-msg").count();
    expect(count).toBe(5);
  });
});

test.describe("Twitch Chat — Live Integration (zackrawrr)", () => {
  test("connects and receives live chat messages in sidebar", async ({
    page,
  }) => {
    await page.goto(`${BASE}?channel=${CHANNEL}`);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    // Enable sidebar
    await page.locator("#chat-toggle").click();
    await expect(page.locator("#chat-sidebar")).toHaveClass(/visible/);

    // Wait for WebSocket connection (green dot)
    await expect(page.locator("#chat-status-dot")).toHaveClass(/connected/, {
      timeout: 10_000,
    });

    // Wait for at least one message (zackrawrr is high-traffic when live)
    await expect(page.locator(".chat-msg").first()).toBeVisible({
      timeout: 30_000,
    });

    // Verify message structure
    const firstMsg = page.locator(".chat-msg").first();
    await expect(firstMsg.locator(".chat-user")).toBeVisible();
    await expect(firstMsg.locator(".chat-text")).toBeVisible();

    // Username span should have inline color
    const style = await firstMsg.locator(".chat-user").getAttribute("style");
    expect(style).toContain("color:");

    // Accumulate a few more
    await page.waitForTimeout(5000);
    const msgCount = await page.locator(".chat-msg").count();
    console.log(`  Received ${msgCount} messages from #${CHANNEL}`);
    expect(msgCount).toBeGreaterThan(1);
  });

  test("ticker mode shows scrolling items from live chat", async ({
    page,
  }) => {
    await page.goto(`${BASE}?channel=${CHANNEL}`);
    await expect(page.locator("#tuner-range")).toBeVisible({ timeout: 10_000 });

    // Click twice: Off → Sidebar → Ticker
    await page.locator("#chat-toggle").click();
    await page.locator("#chat-toggle").click();
    await expect(page.locator("#chat-ticker")).toHaveClass(/visible/);

    // Wait for connection + messages
    await expect(page.locator("#chat-status-dot")).toHaveClass(/connected/, {
      timeout: 10_000,
    });
    await expect(page.locator(".chat-ticker-item").first()).toBeVisible({
      timeout: 30_000,
    });

    // Verify ticker item structure
    const firstItem = page.locator(".chat-ticker-item").first();
    await expect(firstItem.locator(".chat-user")).toBeVisible();
    await expect(firstItem.locator(".chat-text")).toBeVisible();

    // Animation duration should be set dynamically
    const dur = await page
      .locator("#chat-ticker-track")
      .evaluate((el: HTMLElement) => el.style.animationDuration);
    expect(dur).toMatch(/[\d.]+s/);
    console.log(`  Ticker animation duration: ${dur}`);
  });
});
