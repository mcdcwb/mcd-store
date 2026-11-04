import assert from "node:assert/strict";
import test from "node:test";
import { Writable } from "node:stream";
import { v2 as cloudinary } from "cloudinary";
import { uploadProductImage, PRODUCT_IMAGE_FOLDER } from "../src/services/upload.service.js";
import { UploadUnavailableError } from "../src/config/cloudinary.js";

test("Cloudinary SDK uses an image stream, unique IDs, folder and allowed formats; failures are sanitized", async t => {
  const keys = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];
  const saved = keys.map(key => process.env[key]);
  keys.forEach(key => { process.env[key] = "unit-test-placeholder"; });
  const ids: string[] = [];
  const logs: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  let mode = "success";
  const url = "https://res.cloudinary.com/test/image/upload/v1/mcd-store-demo/products/file.png";
  t.mock.method(cloudinary.uploader, "upload_stream", (options: any, callback: any) => {
    assert.equal(options.folder, PRODUCT_IMAGE_FOLDER); assert.equal(options.resource_type, "image");
    assert.deepEqual(options.allowed_formats, ["jpg", "png", "webp"]); assert.equal(options.overwrite, false);
    assert.equal(options.timeout, 60000); assert.match(options.public_id, /^[a-f0-9-]{36}$/); ids.push(options.public_id);
    if (mode === "throw") throw new Error("private provider configuration");
    return new Writable({ write(chunk, _encoding, done) {
      assert.equal(chunk.toString(), "test-image");
      if (mode === "stream") return done(new Error("private stream details"));
      callback(mode === "callback" ? Object.assign(new Error("private API secret"), { http_code: 401, code: "api_error" }) : null, { secure_url: mode === "unsafe" ? "http://invalid.test/image.png" : url, api_key: "private" });
      done();
    } });
  });
  try {
    assert.equal(await uploadProductImage(Buffer.from("test-image")), url);
    assert.equal(await uploadProductImage(Buffer.from("test-image")), url); assert.notEqual(ids[0], ids[1]);
    for (mode of ["throw", "stream", "callback", "unsafe"]) await assert.rejects(uploadProductImage(Buffer.from("test-image")), { message: "Não foi possível enviar a imagem. Tente novamente." });
    const output = JSON.stringify(logs);
    assert.match(output, /provider_response/);
    assert.match(output, /api_error/);
    assert.match(output, /401/);
    assert.doesNotMatch(output, /private API secret|https:\/\/res\.cloudinary\.com|api_key|private provider configuration/);
    delete process.env.CLOUDINARY_API_SECRET;
    await assert.rejects(uploadProductImage(Buffer.from("test-image")), UploadUnavailableError);
  } finally { keys.forEach((key, index) => { if (saved[index] === undefined) delete process.env[key]; else process.env[key] = saved[index]; }); }
});
