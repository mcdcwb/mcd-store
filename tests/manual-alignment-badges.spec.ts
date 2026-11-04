import { test, expect } from "@playwright/test";
import { pngPixels } from "./helpers/png-pixels";

for (const dpr of [1, 1.25, 1.5, 2]) test(`raster investigation DPR ${dpr}`, async ({ browser }, info) => {
  test.setTimeout(120000);
  const context = await browser.newContext({ deviceScaleFactor: dpr });
  const page = await context.newPage();
  await page.route("**/api/produtos", route => route.fulfill({ json: Array.from({ length: 6 }, (_, index) => ({ id: 9901 + index, name: `Raster ${index}`, price: 30, public: "unissex", category: "camisetas", badge: "NOVIDADE", isPublished: true,
    colors: [{ id: 9901 + index, colorName: "Preto", colorValue: "#111111", images: ["/raster.svg"], variants: [{ id: 9901 + index, value: "P", stock: 1 }] }] })) }));
  await page.route("**/raster.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#e9cccc"/></svg>' }));
  await page.goto("/");
  await expect(page.locator(".store-product-card")).toHaveCount(6);
  for (const width of [320, 390, 768, 1280, 1440, 1649, 1920]) for (const zoom of [1, 0.9, 1.1]) {
    await page.setViewportSize({ width, height: 1200 });
    await page.evaluate(zoom => { document.documentElement.style.zoom = String(zoom); }, zoom);
    const card = page.locator(".store-product-card").first();
    await card.evaluate(el => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 150));
    await page.mouse.move(0, 0);
    const rect = await card.evaluate(el => {
      const card = el.getBoundingClientRect(), photo = el.querySelector(".store-product-photo")!.getBoundingClientRect(), info = el.children[1].getBoundingClientRect();
      const badge = el.querySelector(".store-badge-manual")!.getBoundingClientRect(), svg = el.querySelector(".store-badge-manual svg")!.getBoundingClientRect();
      return { photo: photo.bottom - card.top, info: info.top - card.top, badge: badge.bottom - card.top, badgeTop: badge.top - card.top, svg: svg.bottom - card.top, height: photo.height, photoTop: photo.top - card.top };
    });
    const cardBox = (await card.boundingBox())!;
    const shot = await card.screenshot({ path: info.outputPath(`raster-before-${width}-${zoom}-${dpr}.png`) });
    const png = pngPixels(shot), scaleX = png.width / cardBox.width, scaleY = png.height / cardBox.height;
    const edge = Math.round(rect.photo * scaleY), bodyX = Math.round(20 * scaleX), firstBelow = Math.floor(rect.photo * scaleY);
    const belowRows = Array.from({ length: 3 }, (_, i) => png.pixel(bodyX, firstBelow + i));
    await page.addStyleTag({ content: ".store-product-card .store-badge-manual { visibility: hidden !important }" });
    const noBadge = pngPixels(await card.screenshot());
    await page.locator("style").last().evaluate(el => el.remove());
    const photoControl = Array.from({ length: 3 }, (_, i) => noBadge.pixel(bodyX, firstBelow + i));
    console.log(JSON.stringify({ width, zoom, dpr, edge, bodyX, belowRows, photoControl }));
  }
  await context.close();
});

for (const width of [320, 390, 768, 1440, 1920]) test(`manual painted edge meets photo boundary at ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  const products = [1, 2].map(id => ({ id: 9900 + id, name: `Alignment ${id}`, price: 30, public: "unissex", category: "camisetas", badge: id === 1 ? "NOVIDADE" : "LANÇAMENTO", isPublished: true,
    colors: [{ id: 9900 + id, colorName: "Preto", colorValue: "#111111", images: ["/alignment.svg", "/alignment-back.svg"], variants: [{ id, value: "P", stock: 1 }] }] }));
  await page.route("**/api/produtos", route => route.fulfill({ json: products }));
  await page.route("**/api/settings/public", route => route.fulfill({ json: { address: null, whatsapp: null, lowStockThreshold: 5, showLastUnitBadge: true, showLowStockBadge: true } }));
  await page.route("**/alignment*.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="800"><rect width="400" height="800" fill="#e9cccc"/></svg>' }));
  await page.goto("/");
  await expect(page.locator(".store-product-card")).toHaveCount(2);
  await page.addStyleTag({ content: ".store-product-badges { clip-path: inset(-1px 0 0 0) !important } .store-product-badges > .store-badge-manual { bottom: 0 !important }" });
  await page.locator(".store-product-card").first().screenshot({ path: info.outputPath(`manual-edge-before-${width}.png`) });
  await page.locator("style").last().evaluate(el => el.remove());
  const measure = () => page.locator(".store-badge-manual").evaluateAll(elements => elements.map(el => {
    const photo = el.closest(".store-product-photo")!, frame = photo.getBoundingClientRect(), bounds = el.getBoundingClientRect();
    const path = el.querySelector<SVGPathElement>("path")!, box = path.getBBox(), matrix = path.getScreenCTM()!;
    const bottom = new DOMPoint(box.x, box.y + box.height).matrixTransform(matrix).y;
    const svg = el.querySelector("svg")!, view = svg.viewBox.baseVal;
    const layer = el.parentElement!.getBoundingClientRect();
    return { detail: el.getAttribute("data-badge-size"), photoBottom: frame.bottom, paintedBottom: bottom, cssBottom: bounds.bottom, gap: frame.bottom - bottom, layerHeight: layer.height,
      visibleGap: frame.bottom - Math.min(bottom, layer.bottom), clipped: Math.max(0, bottom - (layer.bottom + layer.width * 0.02)), layerBottom: layer.bottom,
      width: bounds.width, height: bounds.height, shadow: getComputedStyle(svg).filter, transform: getComputedStyle(el).transform,
      box: { x: box.x, y: box.y, width: box.width, height: box.height }, view: { x: view.x, y: view.y, width: view.width, height: view.height },
      svgHeight: svg.getBoundingClientRect().height, cssHeight: bounds.height, bottom: getComputedStyle(el).bottom,
      infoGap: photo.nextElementSibling ? photo.nextElementSibling.getBoundingClientRect().top - frame.bottom : null,
      firstInfoTextGap: photo.nextElementSibling?.querySelector("p") ? photo.nextElementSibling.querySelector("p")!.getBoundingClientRect().top - bottom : null,
      photoStyle: { padding: getComputedStyle(photo).padding, margin: getComputedStyle(photo).margin, border: getComputedStyle(photo).borderBottomWidth }, clip: getComputedStyle(el.parentElement!).clipPath };
  }));
  const verify = async () => {
    for (const geometry of await measure()) {
      expect(geometry.box).toEqual(geometry.view);
      expect(geometry.gap).toBeLessThan(0);
      expect(geometry.gap).toBeGreaterThan(-geometry.layerHeight * 0.02);
      expect(geometry.visibleGap).toBeLessThanOrEqual(1.01);
      expect(geometry.clipped).toBeLessThan(0.05);
      expect(Math.abs(geometry.layerBottom - geometry.photoBottom)).toBeLessThan(1.1);
      expect(Math.abs(geometry.cssBottom - geometry.paintedBottom)).toBeLessThan(0.05);
      expect(geometry.width).toBeCloseTo(geometry.detail === "detail" ? 134.4 : 89.6, 1);
      expect(geometry.height).toBeCloseTo(geometry.detail === "detail" ? 41.9364 : 27.9576, 1);
      expect(geometry.shadow).toBe("drop-shadow(rgba(0, 0, 0, 0.45) 0px 3px 5px)");
      expect(geometry.transform).toBe("none"); expect(parseFloat(geometry.bottom)).toBeCloseTo(-geometry.layerHeight * 0.01, 1);
      if (geometry.detail !== "detail") expect(geometry.firstInfoTextGap).toBeGreaterThan(0);
      if (geometry.detail !== "detail") expect(geometry.infoGap).toBeCloseTo(0, 2);
    }
  };
  await verify();
  const card = page.locator(".store-product-card").first();
  const originalPhoto = (await card.locator(".store-product-photo").boundingBox())!;
  await card.evaluate(el => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 120));
  await card.getByRole("img").hover();
  await expect.poll(() => card.getByRole("img").evaluate(el => parseFloat(getComputedStyle(el).scale))).toBe(1.05);
  await card.getByRole("button", { name: "Próxima imagem", exact: true }).click();
  await expect(card.getByRole("img")).toHaveAttribute("src", "/alignment-back.svg");
  const afterPhoto = (await card.locator(".store-product-photo").boundingBox())!;
  expect(afterPhoto.width).toBe(originalPhoto.width); expect(afterPhoto.height).toBe(originalPhoto.height);
  await verify();
  await card.screenshot({ path: info.outputPath(`manual-edge-catalog-${width}.png`) });
  await page.goto("/?productId=9901");
  await expect(page.locator(".store-detail-photo")).toBeVisible();
  await page.getByRole("region", { name: "VEJA TAMBÉM" }).locator(".store-product-card").first().screenshot({ path: info.outputPath(`manual-edge-related-${width}.png`) });
  await expect(page.locator(".store-badge-manual")).toHaveCount(2);
  await verify();
  await page.locator(".store-detail-photo").evaluate(el => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 120));
  await page.locator(".store-detail-photo").screenshot({ path: info.outputPath(`manual-edge-detail-${width}.png`) });
  await page.locator(".store-detail-photo").locator("..").screenshot({ path: info.outputPath(`manual-edge-detail-with-thumbnails-${width}.png`) });
  for (const zoom of [1, 0.9, 1.1]) {
    await page.evaluate(zoom => { document.documentElement.style.zoom = String(zoom); }, zoom);
    const photo = page.locator(".store-detail-photo");
    await photo.evaluate(el => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 120));
    const geometry = await photo.locator(".store-badge-manual").first().evaluate(el => {
      const badge = el.getBoundingClientRect(), frame = el.closest(".store-detail-photo")!.getBoundingClientRect();
      return { frameWidth: frame.width, frameHeight: frame.height, badgeLeft: badge.left - frame.left, badgeBottom: badge.bottom - frame.bottom,
        photoBottom: el.querySelector("svg")!.getBoundingClientRect().bottom - frame.bottom,
        infoTop: frame.bottom, straightBodyX: badge.left - frame.left + badge.width * .2, badgeBottomLocal: badge.bottom - frame.top };
    });
    const shot = await photo.screenshot(), raster = pngPixels(shot);
    const px = Math.round(geometry.straightBodyX * raster.width / geometry.frameWidth), edge = Math.round(geometry.frameHeight * raster.height / geometry.frameHeight);
    const samples = Array.from({ length: 4 }, (_, i) => raster.pixel(px, edge - 1 - i));
    await page.addStyleTag({ content: ".store-detail-photo .store-badge-manual { visibility: hidden !important }" });
    const noBadge = pngPixels(await photo.screenshot());
    await page.locator("style").last().evaluate(el => el.remove());
    const control = Array.from({ length: 4 }, (_, i) => noBadge.pixel(px, edge - 1 - i));
    expect(geometry.badgeBottom).toBeGreaterThan(0);
    expect(geometry.badgeBottom).toBeLessThan(geometry.frameHeight * 0.15);
    expect(samples.slice(0, 3).every(pixel => pixel[2] > pixel[0] * 2)).toBe(true);
    expect(control.some(pixel => pixel[0] !== samples[0][0] || pixel[1] !== samples[0][1] || pixel[2] !== samples[0][2])).toBe(true);
    console.log(JSON.stringify({ detailWidth: width, zoom, samples, control }));
  }
});
