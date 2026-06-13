var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_vite = require("vite");
var app = (0, import_express.default)();
var PORT = 3e3;
app.use(import_express.default.json({ limit: "50mb" }));
app.use(import_express.default.urlencoded({ limit: "50mb", extended: true }));
var postersDir = import_path.default.join(process.cwd(), "public", "posters");
var postersJsonPath = import_path.default.join(postersDir, "posters.json");
var deletedJsonPath = import_path.default.join(postersDir, "deleted_ids.json");
if (!import_fs.default.existsSync(postersDir)) {
  import_fs.default.mkdirSync(postersDir, { recursive: true });
}
function getDeletedIds() {
  try {
    if (import_fs.default.existsSync(deletedJsonPath)) {
      const raw = import_fs.default.readFileSync(deletedJsonPath, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("Error reading deleted ids:", err);
  }
  return [];
}
function saveDeletedId(id) {
  try {
    const ids = getDeletedIds();
    if (!ids.includes(id)) {
      ids.push(id);
      import_fs.default.writeFileSync(deletedJsonPath, JSON.stringify(ids, null, 2), "utf-8");
    }
  } catch (err) {
    console.error("Error saving deleted id:", err);
  }
}
var defaultPosters = [];
function savePostersData(data) {
  try {
    import_fs.default.writeFileSync(postersJsonPath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing posters metadata json file:", err);
  }
}
function getPostersData() {
  try {
    if (import_fs.default.existsSync(postersJsonPath)) {
      const raw = import_fs.default.readFileSync(postersJsonPath, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("Error reading posters metadata, recreating default DB:", err);
  }
  savePostersData(defaultPosters);
  return defaultPosters;
}
if (!import_fs.default.existsSync(postersJsonPath)) {
  savePostersData(defaultPosters);
}
app.use("/posters", import_express.default.static(postersDir));
app.get("/api/posters", (req, res) => {
  res.json(getPostersData());
});
app.post("/api/posters", (req, res) => {
  const { title, tag, image, objectFit } = req.body;
  if (!title || !image) {
    return res.status(400).json({ error: "Missing title or image parameters." });
  }
  const id = `poster-${Date.now()}`;
  let imagePath = image;
  if (image.startsWith("data:image/")) {
    try {
      const mimeMatches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (mimeMatches && mimeMatches.length === 3) {
        const ext = mimeMatches[1].split("/")[1] || "jpg";
        const buffer = Buffer.from(mimeMatches[2], "base64");
        const filename = `${id}.${ext}`;
        const filePath = import_path.default.join(postersDir, filename);
        import_fs.default.writeFileSync(filePath, buffer);
        imagePath = `/posters/${filename}`;
      }
    } catch (err) {
      console.error("Error saving base64 image decoding on system root:", err);
      return res.status(500).json({ error: "Failed to process image attachment storage." });
    }
  }
  const newPoster = {
    id,
    title: title.toUpperCase(),
    tag: (tag || "").toUpperCase(),
    image: imagePath,
    objectFit: objectFit || "contain",
    createdAt: Date.now()
  };
  const currentDatabase = getPostersData();
  currentDatabase.push(newPoster);
  savePostersData(currentDatabase);
  res.status(201).json(newPoster);
});
app.post("/api/posters/sync", (req, res) => {
  const { posters } = req.body;
  if (!Array.isArray(posters)) {
    return res.status(400).json({ error: "Invalid posters format" });
  }
  const currentDatabase = getPostersData();
  const deletedIds = getDeletedIds();
  let updated = false;
  for (const clientPoster of posters) {
    if (deletedIds.includes(clientPoster.id)) {
      continue;
    }
    const existingIndex = currentDatabase.findIndex((item) => item.id === clientPoster.id);
    let targetImage = clientPoster.image;
    if (clientPoster.image.startsWith("/posters/")) {
      const filename = clientPoster.image.replace("/posters/", "");
      const filePath = import_path.default.join(postersDir, filename);
      if (!import_fs.default.existsSync(filePath) && clientPoster.localBackupImage && clientPoster.localBackupImage.startsWith("data:image/")) {
        try {
          const mimeMatches = clientPoster.localBackupImage.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          if (mimeMatches && mimeMatches.length === 3) {
            const buffer = Buffer.from(mimeMatches[2], "base64");
            import_fs.default.writeFileSync(filePath, buffer);
            console.log(`Successfully re-hydrated lost poster asset: ${filename}`);
          }
        } catch (e) {
          console.error(`Failed re-hydrating lost poster ${filename}:`, e);
        }
      }
    } else if (clientPoster.image.startsWith("data:image/")) {
      try {
        const mimeMatches = clientPoster.image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (mimeMatches && mimeMatches.length === 3) {
          const ext = mimeMatches[1].split("/")[1] || "jpg";
          const filename = `${clientPoster.id}.${ext}`;
          const filePath = import_path.default.join(postersDir, filename);
          const buffer = Buffer.from(mimeMatches[2], "base64");
          import_fs.default.writeFileSync(filePath, buffer);
          targetImage = `/posters/${filename}`;
        }
      } catch (e) {
        console.error("Direct image recover from base64 failed", e);
      }
    }
    if (existingIndex !== -1) {
      if (currentDatabase[existingIndex].image !== targetImage) {
        currentDatabase[existingIndex].image = targetImage;
        updated = true;
      }
    } else {
      const newPoster = {
        id: clientPoster.id,
        title: (clientPoster.title || "").toUpperCase(),
        tag: (clientPoster.tag || "").toUpperCase(),
        image: targetImage,
        objectFit: clientPoster.objectFit || "contain",
        createdAt: clientPoster.createdAt || Date.now()
      };
      currentDatabase.push(newPoster);
      updated = true;
    }
  }
  if (updated) {
    savePostersData(currentDatabase);
  }
  res.json(currentDatabase);
});
app.put("/api/posters/:id", (req, res) => {
  const { id } = req.params;
  const { title, tag } = req.body;
  const currentDatabase = getPostersData();
  const targetIndex = currentDatabase.findIndex((item) => item.id === id);
  if (targetIndex === -1) {
    return res.status(404).json({ error: "Poster item not found in DB." });
  }
  if (title) currentDatabase[targetIndex].title = title.toUpperCase();
  if (tag) currentDatabase[targetIndex].tag = tag.toUpperCase();
  savePostersData(currentDatabase);
  res.json(currentDatabase[targetIndex]);
});
app.delete("/api/posters/:id", (req, res) => {
  const { id } = req.params;
  let currentDatabase = getPostersData();
  const targetItem = currentDatabase.find((item) => item.id === id);
  if (!targetItem) {
    return res.status(404).json({ error: "Poster item not found" });
  }
  if (targetItem.image.startsWith("/posters/")) {
    const filename = targetItem.image.replace("/posters/", "");
    const filePath = import_path.default.join(postersDir, filename);
    try {
      if (import_fs.default.existsSync(filePath)) {
        const isSeededFile = ["week01_chair.jpg", "week02_glass.jpg", "week03_book.jpg", "week04_pattern.jpg"].includes(filename);
        if (!isSeededFile) {
          import_fs.default.unlinkSync(filePath);
        }
      }
    } catch (err) {
      console.error("Failed to delete physical image file:", err);
    }
  }
  currentDatabase = currentDatabase.filter((item) => item.id !== id);
  savePostersData(currentDatabase);
  saveDeletedId(id);
  res.json({ success: true, id });
});
app.post("/api/posters/reset", (req, res) => {
  try {
    const files = import_fs.default.readdirSync(postersDir);
    const seededNames = ["week01_chair.jpg", "week02_glass.jpg", "week03_book.jpg", "week04_pattern.jpg", "posters.json"];
    for (const file of files) {
      if (!seededNames.includes(file)) {
        import_fs.default.unlinkSync(import_path.default.join(postersDir, file));
      }
    }
  } catch (err) {
    console.error("Reset storage flush cleanup failed:", err);
  }
  const resetData = [];
  savePostersData(resetData);
  try {
    if (import_fs.default.existsSync(deletedJsonPath)) {
      import_fs.default.writeFileSync(deletedJsonPath, "[]", "utf-8");
    }
  } catch (err) {
  }
  res.json(resetData);
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express Dev Server launched, binding http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
